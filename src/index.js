const express = require('express')
const LocalPod = require('solid-local-pod')
const fetch = require('solid-local-pod/src/solidFileFetch')
const httpsLocalhost = require('https-localhost')()
const nconf = require('nconf')

const port = 2700
const getCerts = async () => {
    if (!nconf.get('cert')) {
        console.log('generating new certificate')
        const newCerts = await httpsLocalhost.getCerts()
        nconf.set('cert', newCerts)
        return newCerts
    } else {
        const serializedCert = nconf.get('cert')
        serializedCert.key = Buffer.from(serializedCert.key)
        serializedCert.cert = Buffer.from(serializedCert.cert)
        return serializedCert
    }
}

const app = express()
app.use(express.static(__dirname + '/LocalPodManagerUI'))
app.use(verifyHost, express.json())
app.listen(port, () => {
    console.log(`The app is available at http://localhost:${port}`)
})


/** @type {Object.<string, LocalPod>} */
const pods = {}
nconf.use('file', { file: './storage.json' })
nconf.defaults({ pods: {}, cert: null })
nconf.load(() => initPods())



app.get('/get_pods', (req, res) => {
    const responsePods = []
    for (const [name, pod] of Object.entries(pods))
        responsePods.push({
            name,
            port: pod.port,
            basePath: pod.basePath,
            isActive: pod.isListening()
        })
    res.status(200).json(responsePods)
})
app.post('/deactivate_pod', (req, res, next) => {
    const { name } = req.body
    pods[name].stopListening()

    res.status(200).send()

    updateStorage()
})

app.post('/activate_pod', (req, res, next) => {
    const { name } = req.body
    pods[name].startListening()

    res.status(200).send()

    updateStorage()
})

app.post('/delete_pod', (req, res, next) => {
    const { name } = req.body
    if (pods[name].isListening())
        pods[name].stopListening()

    delete pods[name]
    res.status(200).send()

    updateStorage()
})

app.post('/add_pod', async (req, res, next) => {
    const config = req.body
    const pod = await createPod(config)
    pods[config.name] = pod
    pod.startListening()
    res.status(200).send()

    updateStorage()
})

function verifyHost(req, res, next) {
    if (req.headers.host !== `localhost:${port}`) {
        return res.status(403).send('Invalid host')
    }
    return next()
}

async function createPod({ name, port, basePath }) {
    const certs = await getCerts()
    return new LocalPod({
        port,
        basePath,
        certs,
        fetch
    })
}

async function initPods() {
    await Promise.all(Object.entries(nconf.get('pods')).map(async ([name, pod]) => {
        const config = {
            name,
            port: pod.port,
            basePath: pod.basePath
        }
        pods[name] = await createPod(config)
        if (pod.isActive)
            pods[name].startListening()
    }))
    console.log('Finished loading')
    console.log(nconf.get('pods'))
}

async function updateStorage() {
    //
    // Save the configuration object to disk
    //
    nconf.set('pods', serializePods(pods))
    return new Promise((resolve, reject) => {
        nconf.save(function (err) {
            if (err) {
                console.error(err.message);
                return;
            }
            console.log('Configuration saved successfully.');
        });
    })
}

function serializePods(pods) {
    const serialized = {}
    for (const [name, pod] of Object.entries(pods)) {
        serialized[name] = {
            port: pod.port,
            basePath: pod.basePath,
            isActive: pod.isListening()
        }
    }
    console.log('serialized', serialized)
    return serialized
}