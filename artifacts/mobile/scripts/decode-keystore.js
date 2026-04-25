#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function fail(msg) {
  console.error(`[decode-keystore] ERROR: ${msg}`);
  process.exit(1);
}

const keystoreB64 = process.env.ANDROID_KEYSTORE_BASE64;
const keystorePassword = process.env.ANDROID_KEYSTORE_PASSWORD;
const keyAlias = process.env.ANDROID_KEY_ALIAS;
const keyPassword = process.env.ANDROID_KEY_PASSWORD;

if (!keystoreB64) fail("ANDROID_KEYSTORE_BASE64 is not set");
if (!keystorePassword) fail("ANDROID_KEYSTORE_PASSWORD is not set");
if (!keyAlias) fail("ANDROID_KEY_ALIAS is not set");
if (!keyPassword) fail("ANDROID_KEY_PASSWORD is not set");

const keystorePath = path.join(projectRoot, "tapee-release.keystore");
fs.writeFileSync(keystorePath, Buffer.from(keystoreB64, "base64"));
console.log(`[decode-keystore] Keystore written to ${keystorePath}`);

const credentials = {
  android: {
    keystore: {
      keystorePassword,
      keyAlias,
      keyPassword,
      keystorePath: "tapee-release.keystore",
    },
  },
};

const credentialsPath = path.join(projectRoot, "credentials.json");
fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2) + "\n");
console.log(`[decode-keystore] credentials.json written to ${credentialsPath}`);
