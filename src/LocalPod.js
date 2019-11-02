const express = require('express')
const cors = require('cors')
const path = require('path')
const http = require('http')
const https = require('https')

/**
 * @typedef {Object} LocalPodConfig
 * @property {number} port
 * @property {string} basePath
 * @property {any} certs
 * @property {function} fetch
 * @property {string} [prefix]
 */

class LocalPod {
    /**
     * @param {LocalPodConfig} config 
     */
    constructor(config) {
        this.port = config.port
        this.basePath = config.basePath
        this.certs = config.certs
        this.fetch = config.fetch
        this.prefix = config.prefix || ''
        this.isListening = false
        this.app = express()
        this.app.use(cors())
        this.app.use(express.raw({ type: '*/*' }))
        this.app.all('*', this.handleRequest.bind(this)) // TODO: Add support for binary, form-encoded, etc.
        this.server = null
    }

    startListening() {
        if (!this.certs) {
            console.warn('Only running on http because no certs were supplied')
            this.server = http.createServer(this.app)
        } else {
            this.server = https.createServer(this.certs, this.app)
        }
        this.server.listen(this.port, () => console.log(`App listening on port ${this.port}`))
    }

    stopListening() {
        if (this.server) {
            this.server.close(err => {
                if (err) {
                    console.error('Error while closing', err)
                    throw err
                }
            })
            this.server = null
        }
    }

    async handleRequest(req, res, next) {
        try {
            const { url, method, headers, body } = req
            const path = this.mapPath(url)
            if (method.toUpperCase() === 'DELETE' && this.isRoot(path))
                return res.status(403).send()

            const response = await this.fetch(path, { method, headers, body })
            for (const [key, val] of response.headers.entries()) {
                if (this.isAllowedHeader(key, val))
                    res.set(key, val)
            }
            const status = response.status
            const buffer = await response.text()
            res.status(status)
                .send(buffer)
        }
        catch (err) {
            console.error(err)
            return next('500 Internal Server Error')
        }
    }

    /**
     * Check if the header should be sent
     * @param {string} key 
     * @param {string} val 
     */
    isAllowedHeader(key, val) {
        const blackList = ['location']
        if (blackList.includes(key))
            return false
        if (key.toLowerCase() === 'content-type' && val === 'false') // Prevent use of solid-rest's unknown header error
            return false

        return true
    }

    /**
     * @param {string} reqPath 
     */
    isRoot(reqPath) {
        return path.relative(this.basePath, reqPath) === ''
    }

    /**
     * Map the path of the request to the file system path
     * @param {string} reqPath
     * @throws {Error} path must be in base path
     */
    mapPath(reqPath) {
        const mappedPath = path.resolve(this.basePath, `.${reqPath}`)
        // Sanity check for making sure that the mapped path is in the basePath (ie no unexpected file is accessed)
        const relative = path.relative(this.basePath, mappedPath)
        if (relative && relative.startsWith('..')) {
            throw new Error('Invalid path')
        }
        return `${this.prefix}${mappedPath}`
    }
}

module.exports = LocalPod