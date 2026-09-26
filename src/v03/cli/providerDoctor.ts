#!/usr/bin/env node

import {
  pathToFileURL
} from "node:url";

import {
  inspectGeminiCredentials
} from "../config/geminiCredentials.js";


export function formatProviderDoctorReport(
  env:
    NodeJS.ProcessEnv =
      process.env
):
  string {

  const inspection =
    inspectGeminiCredentials(
      env
    );


  const lines:
    string[] = [
      "CAMERA INTELLIGENCE PROVIDER DOCTOR",
      "Provider: " +
        inspection.provider,
      "Credential: " +
        inspection.credential,
      "Profile: " +
        inspection.profile
    ];


  if (
    inspection.maskedKey
  ) {
    lines.push(
      "Key: " +
      inspection.maskedKey
    );
  }


  lines.push(
    "Status: " +
    inspection.status
  );


  if (
    inspection.message
  ) {
    lines.push(
      inspection.message
    );
  }


  return lines.join(
    "\n"
  );
}


export function runProviderDoctor(
  env:
    NodeJS.ProcessEnv =
      process.env
):
  number {

  const inspection =
    inspectGeminiCredentials(
      env
    );


  console.log(
    formatProviderDoctorReport(
      env
    )
  );


  return inspection.status ===
    "READY"
      ? 0
      : 1;
}


const entryPath =
  process.argv[
    1
  ];


if (
  entryPath &&
  import.meta.url ===
    pathToFileURL(
      entryPath
    ).href
) {
  process.exitCode =
    runProviderDoctor();
}
