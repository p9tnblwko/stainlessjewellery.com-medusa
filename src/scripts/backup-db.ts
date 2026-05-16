import { ExecArgs } from "@medusajs/framework/types"
import { createWriteStream, mkdirSync, unlinkSync } from "fs"
import { join } from "path"
import { createInterface } from "readline/promises"
import { stdin as input, stdout as output } from "process"
import { spawn } from "child_process"

const BACKUP_DIR = ".backup"

function getDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to create a database backup")
  }

  return process.env.DATABASE_URL
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60)
}

function timestamp(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("") + "_" + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("")
}

function runBackup(
  targetFile: string,
  comment: string,
  databaseUrl: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const backup = spawn("pg_dump", ["--clean", "--if-exists"], {
      env: {
        ...process.env,
        PGDATABASE: databaseUrl,
      },
    })

    const file = createWriteStream(targetFile, { flags: "wx" })

    file.write(`-- Backup created at: ${new Date().toISOString()}\n`)
    file.write(`-- Comment: ${comment}\n\n`)

    backup.stdout.pipe(file, { end: false })
    backup.stderr.pipe(process.stderr)

    backup.on("error", (error) => {
      file.end()
      reject(
        error.message.includes("ENOENT")
          ? new Error("pg_dump is required on the server to create database backups")
          : error
      )
    })

    backup.on("close", (code) => {
      file.end(() => {
        if (code === 0) {
          resolve()
          return
        }

        try {
          unlinkSync(targetFile)
        } catch {
          // The backup may not have been created if pg_dump failed early.
        }

        reject(new Error(`pg_dump exited with code ${code}`))
      })
    })
  })
}

export default async function backupDb(_args: ExecArgs) {
  const rl = createInterface({ input, output })
  const comment = await rl.question("Backup comment: ")
  rl.close()

  mkdirSync(BACKUP_DIR, { recursive: true })

  const namePart = slugify(comment)
  const backupFile = join(
    BACKUP_DIR,
    namePart ? `${timestamp()}_${namePart}.sql` : `${timestamp()}.sql`
  )

  await runBackup(backupFile, comment, getDatabaseUrl())

  console.log(`Backup saved: ${backupFile}`)
}
