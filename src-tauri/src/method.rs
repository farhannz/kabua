use libloading;
use reqwest::{self, cookie::CookieStore};
use std::ffi::CString;
use std::{str::FromStr, sync::Arc};

fn call_dynamic(
    path: String,
    filename: String,
    args: String,
    is_admin: bool,
) -> Result<i64, Box<dyn std::error::Error>> {
    unsafe {
        let mut parent_path = std::env::current_exe().unwrap();
        parent_path.pop();
        let lib_path = format!("{}\\PAAssist.dll", parent_path.display());
        let lib: libloading::Library = libloading::Library::new(lib_path)?;
        let func: libloading::Symbol<unsafe extern "C" fn(*const i8, *const i8, *const i8, bool) -> i64> = lib.get(b"executeProcess\0")?;
        let arg1 = CString::new(path)?;
        let arg2 = CString::new(filename)?;
        let arg3 = CString::new(args)?;
        let flag = is_admin; // bool argument
        Ok(func(arg1.as_ptr(), arg2.as_ptr(), arg3.as_ptr(), flag))
    }
}

pub async fn perform_authenticate_info(url: &str) -> Result<String, Box<dyn std::error::Error>> {
    let target_url = reqwest::Url::from_str(url)?;
    let jar = Arc::new(reqwest::cookie::Jar::default());
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .cookie_provider(jar.clone())
        .build()?;
    let _response = client.get(target_url.clone()).send().await?;
    let cookies = jar
        .cookies(&target_url)
        .ok_or("Error while getting authentication info")?;
    let mut auth_info: String = "".to_owned();
    for value in cookies.to_str()?.to_string().split(";") {
        if value.contains("AuthenticationInfo") {
            auth_info.push_str(value);
            auth_info.push_str(" Path=/; Domain=account.pearlabyss.com; Secure; Expires=Fri, 31 Dec 9999 23:59:59 GMT;");
            break;
        }
    }
    println!("{auth_info}");
    // AuthenticationInfo=; Path=/; Domain=account.pearlabyss.com; Secure; Expires=Fri, 31 Dec 9999 23:59:59 GMT;

    Ok(auth_info.to_string())
}

pub async fn perform_login(
    url: &str,
    email: &str,
    password: &str,
    state: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let auth_url = reqwest::Url::from_str(url)?;
    let target_url = reqwest::Url::from_str(
        "https://account.pearlabyss.com/en-us/Member/SignIn/PssSignInProcess",
    )?;
    let jar = Arc::new(reqwest::cookie::Jar::default());
    let client: reqwest::Client = reqwest::Client::builder()
        .cookie_store(true)
        .cookie_provider(jar.clone())
        .build()?;
    let params = [
        ("_authAction", "1"),
        ("_authPlatform", "2"),
        (
            "_returnUrl",
            "https://account.pearlabyss.com/Member/Login/LoginPending",
        ),
        ("_state", state),
        ("_loginPosition", "Account"),
        ("hdAccountUrl", "https://account.pearlabyss.com"),
        ("_useIPCheck", "false"),
        ("_email", email),
        ("_password", password),
        ("_useAutoLogin", "false"),
        ("_isRemember", "false"),
        ("X-Requested-With", "XMLHttpRequest"),
    ];
    let _auth_response = client.get(auth_url.clone()).send().await?;
    let response: reqwest::Response = client
        .post(target_url.clone())
        .header("User-Agent", "HTTPie")
        .header("X-Requested-With", "XHMLHttpRequest")
        .form(&params)
        .send()
        .await?;
    let body = response.text().await?;
    Ok(body)
}

#[tauri::command(async)]
pub async fn get_login_code(
    url: &str,
    email: &str,
    password: &str,
    state: &str,
) -> Result<String, String> {
    match perform_login(url, email, password, state).await {
        Ok(json_string) => Ok(json_string),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(async)]
pub async fn get_authenticate_info(url: &str) -> Result<String, String> {
    match perform_authenticate_info(url).await {
        Ok(auth_info) => Ok(auth_info),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn execute_process(
    path: String,
    filename: String,
    args: String,
    is_admin: bool,
) -> Result<String, String> {
    match call_dynamic(path, filename, args, is_admin) {
        Ok(code) => Ok(code.to_string()),
        Err(e) => Err(e.to_string()),
    }
}
