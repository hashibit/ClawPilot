/**
 * SSH utility module using ssh2 library
 * Provides SSH connection and command execution for remote office management
 */

import { Client } from 'ssh2'
import { createLogger } from '../logger.js'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'

const log = createLogger('ssh')

/**
 * SSH connection options
 * @typedef {Object} SSHOptions
 * @property {string} host - Host IP address
 * @property {number} port - SSH port (default 22)
 * @property {string} user - SSH username
 * @property {string} [password] - Password for authentication
 * @property {string} [keyPath] - Path to private key file
 * @property {string} [keyContent] - Private key content (alternative to keyPath)
 * @property {number} [timeout] - Connection timeout in ms (default 10000)
 */

/**
 * Command execution result
 * @typedef {Object} CommandResult
 * @property {number} exitCode - Exit code of the command
 * @property {string} stdout - Standard output
 * @property {string} stderr - Standard error
 */

/**
 * Execute a command on a remote host via SSH
 * @param {SSHOptions} options - SSH connection options
 * @param {string} command - Command to execute
 * @param {Object} [execOptions] - Execution options
 * @param {number} [execOptions.timeout] - Command timeout in ms
 * @param {function(string): void} [execOptions.onStdout] - Callback for stdout chunks
 * @param {function(string): void} [execOptions.onStderr] - Callback for stderr chunks
 * @returns {Promise<CommandResult>}
 */
export async function sshExecRaw(options, command, execOptions = {}) {
  const { host, port = 22, user, password, keyPath, keyContent, timeout = 10000 } = options
  const { timeout: cmdTimeout = 60000, onStdout, onStderr } = execOptions

  return new Promise((resolve, reject) => {
    const conn = new Client()
    let stdout = ''
    let stderr = ''
    let exitCode = 0
    let cmdTimer = null

    const cleanup = () => {
      if (cmdTimer) clearTimeout(cmdTimer)
      conn.end()
    }

    conn.on('ready', () => {
      log.debug(`SSH connected to ${user}@${host}:${port}`)

      conn.exec(command, (err, stream) => {
        if (err) {
          cleanup()
          reject(err)
          return
        }

        // Set command timeout
        if (cmdTimeout > 0) {
          cmdTimer = setTimeout(() => {
            cleanup()
            reject(new Error(`Command timeout after ${cmdTimeout}ms`))
          }, cmdTimeout)
        }

        stream.on('close', (code) => {
          exitCode = code ?? 0
          cleanup()
          resolve({ exitCode, stdout, stderr })
        })

        stream.on('data', (data) => {
          const str = data.toString()
          stdout += str
          if (onStdout) onStdout(str)
        })

        stream.stderr.on('data', (data) => {
          const str = data.toString()
          stderr += str
          if (onStderr) onStderr(str)
        })
      })
    })

    conn.on('error', (err) => {
      cleanup()
      reject(err)
    })

    // Build connection config
    const connConfig = {
      host,
      port,
      username: user,
      readyTimeout: timeout,
    }

    // Authentication
    if (keyContent) {
      connConfig.privateKey = keyContent
    } else if (keyPath) {
      // Expand ~ in path
      const expandedPath = keyPath.replace(/^~/, homedir())
      if (!existsSync(expandedPath)) {
        reject(new Error(`SSH key file not found: ${expandedPath}`))
        return
      }
      connConfig.privateKey = readFileSync(expandedPath)
    } else if (password) {
      connConfig.password = password
    } else {
      // Try default keys
      const defaultKeyPath = `${homedir()}/.ssh/id_rsa`
      const defaultEd25519Path = `${homedir()}/.ssh/id_ed25519`
      if (existsSync(defaultEd25519Path)) {
        connConfig.privateKey = readFileSync(defaultEd25519Path)
      } else if (existsSync(defaultKeyPath)) {
        connConfig.privateKey = readFileSync(defaultKeyPath)
      } else {
        reject(new Error('No SSH authentication method provided'))
        return
      }
    }

    conn.connect(connConfig)
  })
}

/**
 * Check if SSH connection is possible
 * @param {SSHOptions} options - SSH connection options
 * @returns {Promise<{ok: boolean, latency_ms?: number, error?: string}>}
 */
export async function checkConnection(options) {
  const start = Date.now()
  try {
    await sshExecRaw(options, 'exit 0', { timeout: 5000 })
    return { ok: true, latency_ms: Date.now() - start }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Detect remote system architecture
 * @param {SSHOptions} options - SSH connection options
 * @returns {Promise<{arch: string, os: string}>}
 */
export async function detectArch(options) {
  try {
    const { stdout } = await sshExecRaw(options, 'uname -m && uname -s', { timeout: 10000 })
    const lines = stdout.trim().split('\n')
    const arch = lines[0]?.trim() || 'x86_64'
    const os = lines[1]?.trim() || 'Linux'
    // Normalize architecture names
    const archMap = { 'arm64': 'aarch64', 'amd64': 'x86_64' }
    return { arch: archMap[arch] || arch, os }
  } catch {
    return { arch: 'x86_64', os: 'Linux' }
  }
}

/**
 * Check if a file exists on remote host
 * @param {SSHOptions} options - SSH connection options
 * @param {string} path - File path to check
 * @returns {Promise<boolean>}
 */
export async function fileExists(options, path) {
  try {
    const { exitCode } = await sshExecRaw(options, `test -f "${path}"`, { timeout: 5000 })
    return exitCode === 0
  } catch {
    return false
  }
}

/**
 * Check if a command exists on remote host
 * Searches in common user-level bin directories that may not be in default PATH
 * @param {SSHOptions} options - SSH connection options
 * @param {string} cmd - Command name
 * @returns {Promise<{exists: boolean, path?: string}>}
 */
export async function commandExists(options, cmd) {
  // Common user-level bin paths that may not be in SSH's default PATH
  const userBinPaths = [
    '$HOME/.npm-global/bin',
    '$HOME/.local/bin',
    '/usr/local/bin',
  ].join(':')

  try {
    // Set PATH to include user-level directories before running which
    const { stdout, exitCode } = await sshExecRaw(
      options,
      `export PATH="${userBinPaths}:\$PATH" && which ${cmd}`,
      { timeout: 5000 }
    )
    if (exitCode === 0 && stdout.trim()) {
      return { exists: true, path: stdout.trim() }
    }
    return { exists: false }
  } catch {
    return { exists: false }
  }
}

/**
 * Read a file from remote host
 * @param {SSHOptions} options - SSH connection options
 * @param {string} path - File path to read
 * @returns {Promise<string>}
 */
export async function readFile(options, path) {
  // Use $HOME instead of ~ since bash does not expand ~ inside double quotes
  const remotePath = path.replace(/^~\//, '$HOME/')
  const { stdout, exitCode } = await sshExecRaw(options, `cat "${remotePath}"`, { timeout: 10000 })
  if (exitCode !== 0) {
    throw new Error(`Failed to read file: ${path}`)
  }
  return stdout
}

/**
 * Upload a local file to remote host via SFTP
 * @param {SSHOptions} options - SSH connection options
 * @param {string} localPath - Local file path
 * @param {string} remotePath - Remote destination path
 * @returns {Promise<void>}
 */
export async function uploadFile(options, localPath, remotePath) {
  const { host, port = 22, user, password, keyPath, keyContent, timeout = 10000 } = options

  return new Promise((resolve, reject) => {
    const conn = new Client()

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end()
          reject(err)
          return
        }

        sftp.fastPut(localPath, remotePath, (err) => {
          conn.end()
          if (err) reject(err)
          else resolve()
        })
      })
    })

    conn.on('error', (err) => {
      reject(err)
    })

    // Build connection config (same as sshExecRaw)
    const connConfig = {
      host,
      port,
      username: user,
      readyTimeout: timeout,
    }

    if (keyContent) {
      connConfig.privateKey = keyContent
    } else if (keyPath) {
      const expandedPath = keyPath.replace(/^~/, homedir())
      connConfig.privateKey = readFileSync(expandedPath)
    } else if (password) {
      connConfig.password = password
    }

    conn.connect(connConfig)
  })
}

/**
 * Execute a command with real-time output callbacks
 * @param {SSHOptions} options - SSH connection options
 * @param {string} command - Command to execute
 * @param {Object} callbacks - Callbacks for output
 * @param {function(string): void} callbacks.onStdout - Called for each stdout line
 * @param {function(string): void} callbacks.onStderr - Called for each stderr line
 * @param {number} [timeout] - Command timeout in ms
 * @returns {Promise<{exitCode: number}>}
 */
export async function execWithCallbacks(options, command, callbacks, timeout = 300000) {
  return sshExecRaw(options, command, {
    timeout,
    onStdout: callbacks.onStdout,
    onStderr: callbacks.onStderr,
  })
}

/**
 * Make an HTTP request to a remote daemon via SSH port forwarding.
 * The daemon only listens on 127.0.0.1 on the remote machine; this tunnels through SSH.
 * @param {SSHOptions} options - SSH connection options
 * @param {string} method - HTTP method
 * @param {string} path - Request path (e.g. '/health')
 * @param {string} [bearerToken] - Optional Authorization: Bearer token
 * @param {object} [body] - Optional JSON body
 * @param {number} [remotePort=16668] - Remote daemon port
 * @returns {Promise<{status: number, data: any}>}
 */
export async function sshHttpRequest(options, method, path, bearerToken, body, remotePort = 16668) {
  const { host, port = 22, user, password, keyPath, keyContent, timeout = 10000 } = options

  return new Promise((resolve, reject) => {
    const conn = new Client()

    conn.on('ready', () => {
      conn.forwardOut('127.0.0.1', 0, '127.0.0.1', remotePort, (err, stream) => {
        if (err) { conn.end(); return reject(err) }

        const headers = [`${method} ${path} HTTP/1.1`, `Host: 127.0.0.1:${remotePort}`]
        if (bearerToken) headers.push(`Authorization: Bearer ${bearerToken}`)
        const bodyStr = body ? JSON.stringify(body) : ''
        if (bodyStr) {
          headers.push('Content-Type: application/json')
          headers.push(`Content-Length: ${Buffer.byteLength(bodyStr)}`)
        }
        headers.push('Connection: close', '')
        const request = headers.join('\r\n') + '\r\n' + bodyStr

        let rawResponse = ''
        stream.on('data', d => { rawResponse += d.toString() })
        stream.on('close', () => {
          conn.end()
          try {
            const [head, ...bodyParts] = rawResponse.split('\r\n\r\n')
            const statusLine = head.split('\r\n')[0]
            const status = parseInt(statusLine.split(' ')[1]) || 0
            const responseBody = bodyParts.join('\r\n\r\n').trim()
            resolve({ status, data: responseBody ? JSON.parse(responseBody) : null })
          } catch (e) {
            reject(new Error(`Failed to parse HTTP response: ${e.message}`))
          }
        })
        stream.on('error', e => { conn.end(); reject(e) })
        stream.write(request)
        stream.end()
      })
    })

    conn.on('error', err => reject(err))

    const connConfig = { host, port, username: user, readyTimeout: timeout }
    if (keyContent) connConfig.privateKey = keyContent
    else if (keyPath) {
      const expandedPath = keyPath.replace(/^~/, homedir())
      connConfig.privateKey = readFileSync(expandedPath)
    } else if (password) {
      connConfig.password = password
    } else {
      const defaultEd25519 = `${homedir()}/.ssh/id_ed25519`
      const defaultRsa = `${homedir()}/.ssh/id_rsa`
      if (existsSync(defaultEd25519)) connConfig.privateKey = readFileSync(defaultEd25519)
      else if (existsSync(defaultRsa)) connConfig.privateKey = readFileSync(defaultRsa)
    }
    conn.connect(connConfig)
  })
}

export default {
  sshExecRaw,
  checkConnection,
  detectArch,
  fileExists,
  commandExists,
  readFile,
  uploadFile,
  execWithCallbacks,
  sshHttpRequest,
}