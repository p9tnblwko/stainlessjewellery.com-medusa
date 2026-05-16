import { ExecArgs } from "@medusajs/framework/types"
import { createReadStream, existsSync, readdirSync } from "fs"
import { join } from "path"
import readline from "readline"
import { createInterface } from "readline/promises"
import { stdin as input, stdout as output } from "process"
import { spawn } from "child_process"

const BACKUP_DIR = ".backup"

function getDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to restore a database backup")
  }

  return process.env.DATABASE_URL
}

function getBackups(): string[] {
  if (!existsSync(BACKUP_DIR)) {
    return []
  }

  return readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .map((name) => join(BACKUP_DIR, name))
}

function drawMenu(backups: string[], selectedIndex: number): void {
  output.write("\x1Bc")
  output.write("Choose backup with arrow keys, then press Enter:\n\n")

  backups.forEach((backup, index) => {
    output.write(`${index === selectedIndex ? "  >" : "   "} ${backup}\n`)
  })
}

function chooseBackup(backups: string[]): Promise<string> {
  return new Promise((resolve) => {
    let selectedIndex = 0

    readline.emitKeypressEvents(input)

    if (input.isTTY) {
      input.setRawMode(true)
    }

    drawMenu(backups, selectedIndex)

    input.on("keypress", (_str, key) => {
      if (key.name === "up" && selectedIndex > 0) {
        selectedIndex -= 1
        drawMenu(backups, selectedIndex)
      }

      if (key.name === "down" && selectedIndex < backups.length - 1) {
        selectedIndex += 1
        drawMenu(backups, selectedIndex)
      }

      if (key.name === "return") {
        if (input.isTTY) {
          input.setRawMode(false)
        }

        input.removeAllListeners("keypress")
        output.write("\n")
        resolve(backups[selectedIndex])
      }

      if (key.ctrl && key.name === "c") {
        if (input.isTTY) {
          input.setRawMode(false)
        }

        process.exit(130)
      }
    })
  })
}

function restoreBackup(backupFile: string, databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const restore = spawn("psql", ["-v", "ON_ERROR_STOP=1"], {
      env: {
        ...process.env,
        PGDATABASE: databaseUrl,
      },
    })

    createReadStream(backupFile).pipe(restore.stdin)
    restore.stdout.pipe(process.stdout)
    restore.stderr.pipe(process.stderr)

    restore.on("error", (error) => {
      reject(
        error.message.includes("ENOENT")
          ? new Error("psql is required on the server to restore database backups")
          : error
      )
    })
    restore.on("close", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`psql exited with code ${code}`))
    })
  })
}

export default async function restoreDb(_args: ExecArgs) {
  const backups = getBackups()

  if (!backups.length) {
    throw new Error(`No .sql backups found in ${BACKUP_DIR}`)
  }

  const backupFile = await chooseBackup(backups)
  const databaseUrl = getDatabaseUrl()

  console.log(`Selected backup: ${backupFile}`)
  console.log("This will restore into the DATABASE_URL database and may overwrite current data.")

  const rl = createInterface({ input, output })
  const confirmation = await rl.question("Type RESTORE to continue: ")
  rl.close()

  if (confirmation !== "RESTORE") {
    console.log("Restore cancelled.")
    return
  }

  await restoreBackup(backupFile, databaseUrl)

  console.log(`Restore completed from: ${backupFile}`)
}
