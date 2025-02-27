/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { type ChildProcess, spawn } from "child_process"
import type { ExtensionContext } from "vscode"
import { commands, window, workspace } from "vscode"
import type { DocumentSelector, LanguageClientOptions, ServerOptions, TextDocumentFilter } from "vscode-languageclient/node";
import { LanguageClient } from "vscode-languageclient/node"

let client: LanguageClient
let server: ChildProcess | undefined

function startServer() {
  const config = workspace.getConfiguration("glspc")
  const serverCommand: string = config.get("serverCommand") ?? ""

  if (serverCommand) {
    const serverCommandArguments: string[] =
      config.get("serverCommandArguments") ?? []

    let documentSelector: DocumentSelector | null = null
    const languageId: string|undefined = config.get("languageId")
    if (languageId !== undefined) {
      documentSelector =  [languageId]
      // TODO: warn user this is deprecated
    } else {
      const documentFilters: TextDocumentFilter[] = config.get("documentFilters") ?? []
      for (const filter of documentFilters) {
        filter.scheme = 'file'
      }
      documentSelector = documentFilters
    }

    const initializationOptions: object =
      config.get("initializationOptions") ?? {}
    const environmentVariables: Record<string, unknown> =
      config.get("environmentVariables") ?? {}

    const outputChannel = window.createOutputChannel("glspc")
    outputChannel.appendLine("starting glspc...")

    const serverOptions: ServerOptions = (): Promise<ChildProcess> => {
      const env = { ...process.env }
      for (const [key, value] of Object.entries(environmentVariables)) {
        if (typeof value !== "string") continue
        env[key] = value.replace(
          /\$(\w+)/g,
          (_, varName: string) => env[varName] ?? "",
        )
      }
      server = spawn(serverCommand, serverCommandArguments, {
        env,
        cwd: workspace.workspaceFolders?.[0]?.uri.fsPath,
      })

      server.on("error", error => {
        outputChannel.appendLine(`Failed to start server: ${error.message}`)
        void window.showErrorMessage(
          `Failed to start language server: ${serverCommand}. Error: ${error.message}`,
        )
      })

      server.on("exit", (code, signal) => {
        outputChannel.appendLine(
          `Server process exited with code ${code} and signal ${signal}`,
        )
      })

      server.on("spawn", () => {
        void window.showInformationMessage(
          `Started language server: ${serverCommand}`,
        )
      })

      return Promise.resolve(server)
    }

    const clientOptions: LanguageClientOptions = {
      documentSelector: documentSelector,
      diagnosticCollectionName: "glspc",
      initializationOptions,
    }

    client = new LanguageClient(
      "glspc",
      "Generic LSP Client",
      serverOptions,
      clientOptions,
    )

    void client.start().then(() => outputChannel.appendLine("started glspc."))
  }
}

async function killServer(): Promise<void> {
  await client.stop()
  server?.kill()
}

export function activate(context: ExtensionContext) {
  startServer()

  context.subscriptions.push(
    commands.registerCommand("glspc.restartServer", async () => {
      await killServer()
      startServer()
    }),
  )
}

export function deactivate(): Thenable<void> | undefined {
  return killServer()
}
