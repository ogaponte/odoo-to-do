use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, USER_AGENT};
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;
use thiserror::Error;

use crate::models::{ConnectionTestResult, OdooInstance};

#[derive(Error, Debug)]
pub enum OdooError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Odoo error: {0}")]
    Odoo(String),

    #[error("Authentication failed for user {0}")]
    AuthFailed(String),

    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
}

pub struct OdooClient {
    client: Client,
}

impl OdooClient {
    pub fn new() -> Self {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(USER_AGENT, HeaderValue::from_static("OdooTasksDesktop/0.1"));

        let client = Client::builder()
            .timeout(Duration::from_secs(20))
            .default_headers(headers)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self { client }
    }

    /// Authenticates with Odoo. Supports both session auth and jsonrpc common auth.
    pub async fn authenticate(&self, instance: &OdooInstance) -> Result<i64, OdooError> {
        let base_url = instance.url.trim_end_matches('/');

        // 1. Try standard /web/session/authenticate
        let auth_url = format!("{}/web/session/authenticate", base_url);
        let auth_body = json!({
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "db": instance.db,
                "login": instance.username,
                "password": instance.api_key
            }
        });

        let resp = self.client.post(&auth_url).json(&auth_body).send().await;
        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(val) = res.json::<Value>().await {
                    if let Some(result) = val.get("result") {
                        if let Some(uid) = result.get("uid").and_then(|u| u.as_i64()) {
                            if uid > 0 {
                                return Ok(uid);
                            }
                        }
                    }
                }
            }
        }

        // 2. Fallback to /jsonrpc endpoint (service: "common", method: "authenticate")
        let jsonrpc_url = format!("{}/jsonrpc", base_url);
        let common_body = json!({
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "service": "common",
                "method": "authenticate",
                "args": [
                    instance.db,
                    instance.username,
                    instance.api_key,
                    json!({})
                ]
            }
        });

        let res2 = self.client.post(&jsonrpc_url).json(&common_body).send().await?;
        let val2: Value = res2.json().await?;

        if let Some(err) = val2.get("error") {
            let msg = err.get("data")
                .and_then(|d| d.get("message"))
                .or_else(|| err.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown Odoo error");
            return Err(OdooError::Odoo(msg.to_string()));
        }

        if let Some(uid) = val2.get("result").and_then(|r| r.as_i64()) {
            if uid > 0 {
                return Ok(uid);
            }
        }

        Err(OdooError::AuthFailed(instance.username.clone()))
    }

    /// Tests the connection to an Odoo instance
    pub async fn test_connection(&self, instance: &OdooInstance) -> ConnectionTestResult {
        match self.authenticate(instance).await {
            Ok(uid) => {
                // Fetch server version
                let version_url = format!("{}/web/webclient/version_info", instance.url.trim_end_matches('/'));
                let v_resp = self.client.post(&version_url).json(&json!({"jsonrpc": "2.0", "params": {}})).send().await;
                let mut server_version = None;
                if let Ok(res) = v_resp {
                    if let Ok(val) = res.json::<Value>().await {
                        if let Some(ver) = val.get("result").and_then(|r| r.get("server_version")).and_then(|s| s.as_str()) {
                            server_version = Some(ver.to_string());
                        }
                    }
                }

                ConnectionTestResult {
                    success: true,
                    message: format!("Connected successfully as user ID: {}", uid),
                    odoo_version: server_version,
                    user_id: Some(uid),
                }
            }
            Err(e) => ConnectionTestResult {
                success: false,
                message: format!("Connection failed: {}", e),
                odoo_version: None,
                user_id: None,
            },
        }
    }

    /// Executes call_kw or jsonrpc execute_kw
    pub async fn execute_kw(
        &self,
        instance: &OdooInstance,
        model: &str,
        method: &str,
        args: Value,
        kwargs: Value,
    ) -> Result<Value, OdooError> {
        let uid = self.authenticate(instance).await?;
        let base_url = instance.url.trim_end_matches('/');

        let jsonrpc_url = format!("{}/jsonrpc", base_url);
        let body = json!({
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "service": "object",
                "method": "execute_kw",
                "args": [
                    instance.db,
                    uid,
                    instance.api_key,
                    model,
                    method,
                    args,
                    kwargs
                ]
            }
        });

        let resp = self.client.post(&jsonrpc_url).json(&body).send().await?;
        let val: Value = resp.json().await?;

        if let Some(err) = val.get("error") {
            let msg = err.get("data")
                .and_then(|d| d.get("message"))
                .or_else(|| err.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("Odoo operation error");
            return Err(OdooError::Odoo(msg.to_string()));
        }

        Ok(val.get("result").cloned().unwrap_or(Value::Null))
    }

    /// Reads records from Odoo matching domain and fields
    pub async fn search_read(
        &self,
        instance: &OdooInstance,
        model: &str,
        domain: Value,
        fields: &[&str],
        limit: Option<usize>,
    ) -> Result<Vec<Value>, OdooError> {
        let mut kwargs = json!({
            "fields": fields,
        });

        if let Some(lim) = limit {
            kwargs["limit"] = json!(lim);
        }

        let res = self.execute_kw(
            instance,
            model,
            "search_read",
            json!([domain]),
            kwargs,
        ).await?;

        if let Some(arr) = res.as_array() {
            Ok(arr.clone())
        } else {
            Ok(Vec::new())
        }
    }

    /// Creates a record in Odoo
    pub async fn create_record(
        &self,
        instance: &OdooInstance,
        model: &str,
        values: Value,
    ) -> Result<i64, OdooError> {
        let res = self.execute_kw(
            instance,
            model,
            "create",
            json!([values]),
            json!({}),
        ).await?;

        if let Some(id) = res.as_i64() {
            Ok(id)
        } else if let Some(arr) = res.as_array() {
            if let Some(first) = arr.first().and_then(|v| v.as_i64()) {
                Ok(first)
            } else {
                Err(OdooError::Odoo("Invalid response format on create".to_string()))
            }
        } else {
            Err(OdooError::Odoo("Could not obtain new record ID from Odoo".to_string()))
        }
    }

    /// Updates a record in Odoo
    pub async fn write_record(
        &self,
        instance: &OdooInstance,
        model: &str,
        odoo_id: i64,
        values: Value,
    ) -> Result<bool, OdooError> {
        let res = self.execute_kw(
            instance,
            model,
            "write",
            json!([[odoo_id], values]),
            json!({}),
        ).await?;

        Ok(res.as_bool().unwrap_or(true))
    }

    /// Deletes a record in Odoo
    pub async fn unlink_record(
        &self,
        instance: &OdooInstance,
        model: &str,
        odoo_id: i64,
    ) -> Result<bool, OdooError> {
        let res = self.execute_kw(
            instance,
            model,
            "unlink",
            json!([[odoo_id]]),
            json!({}),
        ).await?;

        Ok(res.as_bool().unwrap_or(true))
    }
}
