const httpsLocalhost = require("https-localhost")()
const LocalPod = require('./LocalPod')
const SolidRest = require('solid-rest')
const FileHandler = require('solid-rest/src/file')
const solidRest = new SolidRest([new FileHandler])


async function main() {
    // TODO: Check if there is a better way to run localhost via https
    const certs = await httpsLocalhost.getCerts()
    const fetch = solidRest.fetch.bind(solidRest)

    new LocalPod({
        port: 3000,
        basePath: '/home/a_a/test',
        certs,
        fetch
    }).startListening()

    new LocalPod({
        port: 4000,
        basePath: '/home/a_a/test_uni',
        certs,
        fetch
    }).startListening()
}
main()