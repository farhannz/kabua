"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@nextui-org/button";
import {Input} from "@nextui-org/input"
import {fetch, Body, ResponseType, getClient} from '@tauri-apps/api/http';
import { invoke } from '@tauri-apps/api/tauri'
import {envConfig} from "@/config/env"
import {readTextFile, BaseDirectory, exists, writeTextFile, createDir} from "@tauri-apps/api/fs"
import { open } from '@tauri-apps/api/dialog';


export const LoginForm = () => {
  
  interface LoginResponse {
    "resultCode": number,
    "resultMsg": string,
    "returnUrl": string,
    "resultData": string,
    "isAutoLoginSuccess": boolean
  }

  interface OAuthResponse {
    _resultCode: number,
    _resultMsg: string,
    _returnUrl: string
  }

  interface GameStartValidationResponse {
    _authString: string,
    _returnUrl: string,
    _resultCode: number,
    _resultMessage: string,
    _messageStringKey: string,
    _resultData: any,
    _httpStatusCode: number
  }
  
  interface GetTokenResponse {
    _accountToken: string,
    _resultCode: number,
    _returnUrl: string,
    _state: string
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const [configExists, setConfigExists] = useState(false);

  const validateEmail = (value:string) => value.match(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+.[A-Z]{2,4}$/i);

  const isInvalid = useMemo(() => {
    if (email === "") return false;

    return validateEmail(email) ? false : true;
  }, [email]);


  const createToken = async () => {
    try {
      const payload = {
        "_culturecode" :  "en-us"
      };
      const response = await fetch(`${envConfig.AUTH.URL}/api/${envConfig.AUTH.VERSION}/Auth/CreateToken`, {method: "POST", responseType: ResponseType.JSON, body:Body.json(payload)})
      if (response.status != 200) {
        throw "Failed while getting token"
      }
      return response.data
    } catch (error) {
      console.log(error)
    }
  }

  const getCodeFromUrl = async (queryString:string) => {
    try {
      const url = decodeURIComponent(queryString)
      const urlParams = new URLSearchParams(url.split('?')[1]);
      return urlParams.get('code')
    } catch (err) {
      throw `Failed on getting code - ${err}`
    }
  }


  const handleOauth = async (token:string, state:string, code:string) => {
    try {
      const payload = {
        _accountToken: token,
        _code: code,
        _state: state
      }
  
      const headers = {
        Authorization: `Bearer ${token}`,
        SequenceId: `${envConfig.AUTH.URL}/api/${envConfig.AUTH.VERSION}/Auth/OAuth2Callback-${crypto.randomUUID()}`
      }
  
      const response = await fetch(`${envConfig.AUTH.URL}/api/${envConfig.AUTH.VERSION}/Auth/OAuth2Callback`, {method: "POST", responseType: ResponseType.JSON, body: Body.json(payload), headers: headers})
      console.log(response.data)
      const data = response.data as OAuthResponse
      console.log(data)
      if (response.status != 200 || data._resultCode != 0) {
        throw "Failed while handling OAuth"
      }
      return data._resultCode;
    } catch (error) {
      console.log(error)
    }
  }
  
  const handleGameStartValidation = async (token:string) => {
    try {
      const payload = {
        _gameCode: 150,
        _cultureCode: "en-us"
      }
      const headers = {
        Authorization: `Bearer ${token}`,
        SequenceId: `${envConfig.AUTH.URL}/api/${envConfig.AUTH.VERSION}/auth/GameStartValidation-${crypto.randomUUID()}`
      }
      const response = await fetch(`${envConfig.AUTH.URL}/api/${envConfig.AUTH.VERSION}/auth/GameStartValidation`, {method: "POST", responseType: ResponseType.JSON, body: Body.json(payload), headers: headers})
      const data = response.data as GameStartValidationResponse;
      console.log(response.headers)
      console.log(data)
      if (response.status != 200 || data._resultCode != 0) {
        throw "Failed while handling game start validation"
      }
      return data._authString;
    } catch (error) {
      console.log(error)
    }
  }


  const handleCheckConfig = async () => {
    try {
      if (!(await exists('', {dir: BaseDirectory.App}))) {
        await createDir('', {dir:BaseDirectory.App})
      }
      const config_exists = await exists('config.json', {dir: BaseDirectory.AppConfig})
      if (config_exists) {
        const game_config = await readTextFile('config.json', {dir: BaseDirectory.AppConfig})
        const js = JSON.parse(game_config)
        setConfigExists(config_exists)
        const game_path = js.game_path
        console.log(game_config)
        return game_path
      } else {
        const path = await open({directory: true})
        const game_config = {
          game_path : path
        }
        const write_config = await writeTextFile('config.json',JSON.stringify(game_config,undefined,4), {dir: BaseDirectory.AppConfig})
        return game_config.game_path
        // console.log(game_path)
      }
    } catch (error) {
      throw error
    }
  }

  const handleSubmit = async () => {
    try {
      const game_path = await handleCheckConfig();
      const get_token = await createToken() as GetTokenResponse;
      const return_url:string = get_token._returnUrl;
      const state:string = get_token._state
      const token:string = get_token._accountToken
      const login_response = await invoke<string>('get_login_code', {url:return_url, email: email, password: password, state: state})
      const login_result = JSON.parse(login_response) as LoginResponse
      console.log(login_result)
      if (login_result?.resultCode != 0) {
        if( login_result?.returnUrl !== "") {
          throw `Login Failed : ${login_result?.resultMsg}, url: ${login_result?.returnUrl}`
        }
        throw `Login Failed : ${login_result?.resultMsg}`
      }
      // // const login_code_url = await invoke<string>('get_login_code', {url: return_url, email: email, password: password})
      const login_code = await getCodeFromUrl(login_result?.returnUrl)
      // const login_result = await handleLogin(state, auth_info);
      // console.log(login_result)
      const auth_result = await handleOauth(token, state, login_code!)
      if (auth_result != 0) {
        throw "Oauth failed"
      }
      const game_string = await handleGameStartValidation(token);
      const err = await invoke("execute_process", {path: game_path, filename: "BlackDesert64.exe", args: game_string!, isAdmin: true})
      // console.log(err)
      // let err = execute_process("G:\\FNZ\\BDO\\Black Desert\\bin64\\", "BlackDesert64.exe", game_string, true)
    } catch (error) {
      console.log(error)
    }
  }

  return (
    <div className="flex w-full flex-col items-center justify-center flex-wrap md:flex-nowrap gap-4">
      <div className="flex w-2/3 flex-col items-center justify-center flex-wrap md:flex-nowrap gap-4">
        <Input isRequired size="lg" radius="sm" type="email" label="Email" autoComplete="none" isInvalid={isInvalid} color={isInvalid ? "danger" : "default"} errorMessage="Please enter a valid email" onValueChange={setEmail}/>
        <Input size="lg" radius="sm" type="password" label="Password" autoComplete="none" onValueChange={setPassword}/>
      </div>
      <div className="flex w-2/3 flex-row-reverse items-right justify-right flex-wrap md:flex-nowrap gap-4">
        <Button size="lg" radius="sm" color="primary" onPress={handleSubmit} >Sign In</Button>
      </div>
    </div>
  );
};
