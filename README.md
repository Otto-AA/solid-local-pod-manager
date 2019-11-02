# Solid Local Pod Manager

Serve parts of your file system as local solid pods

## Install and Starting

This will start the manager at http://localhost:3000. If you want to tweek some things, feel free to change the source code.

```sh
git clone https://github.com/otto-aa/solid-local-pod-manager
cd solid-local-pod-manager
npm install
npm start
```

## Usage

In the manager, you can add a local pod by using the form at the bottom. It is suggested to use an absolute path to the local directory. When you added a local pod, it will be stored in a storage.json (in the directory where you started the script) file to make it persistent across sessions.

Using the deactivate button, you can stop the server, but still keep it in the list for later usage. Using delete will remove it completely.

## Notes

To serve the file system as solid pod, it uses `solid-local-pod/src/solidFileFetch` which covers most of the solid api specification. You can exchange it to another fetch library if you wish to. In theory you could also use a library which fetches from a cloud service, as long as it provides a fetch(url, options) method and fulfills the solid api spec.