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
    return new Response('placeholder: ' + reqPath, { status: 200 })
}

const head = placeholder
const options = placeholder
const put = placeholder

const methodHandlers = {
    HEAD: assertNot404(head),
    OPTIONS: assertNot404(options),
    GET: assertNot404(get),
    POST: assertNot404(post),
    PUT: put,
    DELETE: assertNot404(_delete)
}

async function fetch(reqPath, options) {
    options = { ...defaultOptions, ...options }

    const { method } = options
    const handler = methodHandlers[method.toUpperCase()]

    try {
        return handler(reqPath, options)
    } catch (err) {
        console.error(err)
        return internalServerErrorResponse()
    }
}

async function get(reqPath, options) {
    return (await isDirectory(reqPath)) ?
        getDirectory(reqPath, options)
        : getFile(reqPath, options)
}

async function getDirectory(reqPath, options) {
    if (options.headers.accept && !options.headers.accept.match('text/turtle') && options.headers.accept.match('text/html')) {
        return new Response(mashlib, {
            status: 200,
            headers: { 'content-type': 'text/html' }
        })
    }
    const content = await getDirectoryContent(reqPath)
    const resOptions = {
        status: 200,
        headers: { 'content-type': 'text/turtle' }
    }
    return new Response(content, resOptions)
}

async function getFile(reqPath, options) {
    const content = await getFileContent(reqPath)
    const contentType = mime.contentType(path.extname(reqPath))
    const resOptions = {
        status: 200,
        headers: contentType ? { 'content-type': contentType } : {}
    }
    return new Response(content, resOptions)
}

async function _delete(reqPath, options) {
    return (await isDirectory(reqPath)) ?
        deleteDirectory(reqPath, options)
        : deleteFile(reqPath, options)
}

async function deleteDirectory(reqPath, options) {
    if ((await fs.promises.readdir(reqPath)).length) {
        return new Response('Directory not Empty', { status: 409 })
    }
    await fs.promises.rmdir(reqPath)
    return new Response(null, { status: 204 })
}

async function deleteFile(reqPath, options) {
    await fs.promises.unlink(reqPath)
    return new Response(null, { status: 204 })
}

async function post(reqPath, options) {
    if (!(await isDirectory(reqPath)))
        return badRequestResponse('POST url must be a directory')
    
    const { slug, link } = options.headers
    if (!slug)
        return badRequestResponse('POST must contain a slug header')
    if (!link)
        return badRequestResponse('POST must contain a link header')

    const itemPath = path.join(reqPath, slug)
    if (link.match('BasicContainer')) {
        return createDirectory(itemPath)
    } else if (link.match('Resource')) {
        return createResource(itemPath, options)
    } else {
        return badRequestResponse('POST must contain a valid link header')
    }
}

async function createDirectory(dirPath) {
    await fs.promises.mkdir(dirPath)
    return new Response('Directory created', { status: 201 })
}

async function createResource(itemPath, options) {
    // TODO: Handle content type
    // TODO: Set proper headers
    const { body } = options
    await fs.promises.writeFile(itemPath, body)
    return new Response('File created', { status: 201 })
}

function assertNot404(handler) {
    return async (reqPath, options) => {
        try {
            await fs.promises.access(reqPath, fs.constants.R_OK)
        } catch (err) {
            return notFoundResponse()
        }
        return handler(reqPath, options)
    }
}

function isDirectory(reqPath) {
    return fs.promises.stat(reqPath)
        .then(stats => stats.isDirectory())
}

async function getDirectoryContent(dirPath) {
    const itemNames = await fs.promises.readdir(dirPath)
    itemNames.unshift('')

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

function badRequestResponse(reason = 'Bad Request') {
    return new Response(reason, {
        status: 400
    })
}

const mashlib = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>Solid Data Browser</title>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        panes.runDataBrowser()
      })
    </script>
  <link href="https://solid.github.io/mashlib/dist/mash.css" rel="stylesheet"></head>
  <body class="db-layout">
    <!-- solid-panes' OutlineManager injects into this element -->
    <header class="db-layout__header header" id="PageHeader"></header>
    <div class="TabulatorOutline db-layout__content" id="DummyUUID" role="main">
        <table id="outline"></table>
        <div id="GlobalDashboard"></div>
    </div>
    <footer class="db-layout__footer" id="PageFooter"></footer>
  <script type="text/javascript" src="https://solid.github.io/mashlib/dist/mashlib.min.js"></script></body>
</html>
`
module.exports = fetch