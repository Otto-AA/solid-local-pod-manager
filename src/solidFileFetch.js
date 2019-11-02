const { Response } = require('node-fetch')
const N3 = require('n3')
const fs = require('fs')
const path = require('path')
const mime = require('mime-types')

const { DataFactory: { namedNode, literal, defaultGraph, quad } } = N3;
const prefixes = {
    // TODO
    ldp: 'http://www.w3.org/ns/ldp#',
    terms: 'http://purl.org/dc/terms/',
    XML: 'http://www.w3.org/2001/XMLSchema#',
    st: 'http://www.w3.org/ns/posix/stat#'
}

/**
 * @param {string} path - starting with file:// TODO Check
 * @param {object} [options]
 */

const defaultOptions = {
    method: 'GET'
}

function placeholder(reqPath, options) {
    return new Response('placholder: ' + reqPath, { status: 200 })
}

const head = placeholder
const options = placeholder
const post = placeholder
const put = placeholder

const methodHandlers = {
    HEAD: head,
    OPTIONS: options,
    GET: get,
    POST: post,
    PUT: put
}

function fetch(reqPath, options) {
    options = { ...defaultOptions, options }

    const { method } = options
    const handler = methodHandlers[method.toUpperCase()]

    return handler(reqPath, options)
}

async function get(reqPath, options) {
    try {
        await fs.promises.access(reqPath, fs.constants.R_OK)
    } catch (err) {
        return notFoundResponse()
    }

    try {
        const stats = await fs.promises.stat(reqPath)

        const content = stats.isDirectory() ?
            await getDirectoryContent(reqPath)
            : await getFileContent(reqPath)
        const contentType = stats.isDirectory() ?
            'text/turtle'
            : mime.contentType(reqPath)

        const resOptions = {
            status: 200,
            headers: {}
        }
        if (contentType) {
            resOptions.headers['content-type'] = contentType
        }

        return new Response(content, resOptions)
    } catch (err) {
        console.error(err)
        return internalServerErrorResponse()
    }
}

async function getDirectoryContent(dirPath) {
    const itemNames = await fs.promises.readdir(dirPath)
    itemNames.push('')

    const writer = new N3.Writer({ prefixes })
    await Promise.all(itemNames.map(async name => {
        const itemPath = path.resolve(dirPath, name)
        const stats = await fs.promises.stat(itemPath)
        writer.addQuads(await statsToQuads(itemPath, name, stats))
    }))

    return new Promise((resolve, reject) => {
        writer.end((err, result) => err ? reject(err) : resolve(result))
    })
}

/**
 * 
 * @param {string} itemPath 
 * @param {Stats} stats
 */
async function statsToQuads(itemPath, name, stats) {
    const quads = []
    const subject = namedNode(name)
    const a = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')

    if (stats.isDirectory()) {
        quads.push(quad(subject, a, namedNode(`${prefixes.ldp}BasicContainer`)))
        quads.push(quad(subject, a, namedNode(`${prefixes.ldp}Container`)))

        const itemNames = await fs.promises.readdir(itemPath)
        itemNames.forEach(itemName => {
            const relPath = path.join(name, itemName)
            quads.push(quad(subject, namedNode(`${prefixes.ldp}contains`), namedNode(relPath)))
        })
    }
    quads.push(quad(subject, a, namedNode(`${prefixes.ldp}Resource`)))
    quads.push(quad(subject, namedNode(`${prefixes.terms}modified`), literal(stats.mtime.toISOString())))
    quads.push(quad(subject, namedNode(`${prefixes.st}mtime`), literal(stats.mtimeMs)))
    quads.push(quad(subject, namedNode(`${prefixes.st}size`), literal(stats.size)))

    return quads
}

function getFileContent(filePath) {
    return fs.promises.readFile(filePath)
}


function notFoundResponse() {
    return new Response('404 Not Found', {
        status: 404
    })
}

function internalServerErrorResponse() {
    return new Response('500 Internal Server Error', {
        status: 500
    })
}

module.exports = fetch