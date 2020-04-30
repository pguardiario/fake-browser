const http = require('http')
const https = require('https')
const http2 = require('http2')
const tls = require('tls')
const zlib = require('zlib')
const { PassThrough } = require('stream')

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0

const baseHeaders = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "en-US;q=0.9,en;q=0.8",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36",
}

const waitForData = async (res, socket) => {
  return await new Promise((resolve, reject) => {
    let stream = new PassThrough()
    switch(res.headers["content-encoding"]){
      case 'gzip':
        res.pipe(zlib.createGunzip()).pipe(stream)
        break
      case 'deflate':
        res.pipe(zlib.Inflate()).pipe(stream)
        break
      case 'br':
        res.pipe(zlib.BrotliDecompress()).pipe(stream)
        break
      default:
        res.pipe(stream)
        break
    }

    // req.setEncoding('utf8');
    let buffers = []

    stream.on('data', (chunk) => {
      buffers.push(chunk)
    })

    stream.on('error', (chunk) => {
      buffers.push(chunk)
    })

    stream.on('end', () => {
      // client.close()
      resolve({headers: res.headers, data: Buffer.concat(buffers)})
    })
  })
}

const withHttp1 = async (url, options, socket) => {
  let response = await new Promise(async (resolve, reject) => {
    let parts = new URL(url)
    let lib = parts.protocol === 'http:' ? http : https
    // debugger
    let connectOpts = socket ? {
      createConnection: () => socket
    } : {
      host: parts.hostname,
      port: portFor(url)
    }
    connectOpts.path = parts.pathname
    connectOpts.method = options.method
    connectOpts.timeout = 10000
    const req = lib.request(connectOpts, async (res) => {
      // resolve(res.headers)
      resolve(await waitForData(res, req))
    })
    req.on('error', (e) => {
      return reject(e)
    })
    req.setHeader('Host', parts.hostname)
    let headers = {...baseHeaders, ...(options.headers || {})}
    for(let key in headers){
      req.setHeader(key, headers[key])
    }
    req.setHeader('Cookie', options.cookies || [])
    if(options.method === 'POST'){
      req.write(options.body)
    }
    req.end()
  }).catch(e => {
    // throw e
  })
  return response
}

const withHttp2 = async (url, options, socket) => {
  return await new Promise(async (resolve, reject) => {
    let parts = new URL(url)
    const client = http2.connect(
      {
        host: parts.hostname,
        port: portFor(url)
      },
      {
        createConnection: () => socket,
        timeout: 10000,
      }
    )
    let headers = {...baseHeaders, ...(options.headers || {})}
    const req = client.request({
      ':path': parts.pathname,
      ':method': options.method,
      ...headers,
      cookie: options.cookies || []
    })
    if(options.method === 'POST'){
      req.write(options.body)
    }
    req.on('response', async (headers) => {
      req.headers = headers
      let data = await waitForData(req)
      client.close()
      resolve(data)
    })
    req.on('error', (e) => {
      return reject(e)
    })
    req.end()
  }).catch(e => {

  })
}

const portFor = url => {
  let parts = new URL(url)
  if(parts.port) return parseInt(parts.port)
  if(parts.protocol === 'https:') return 443
  return 80
}

const socketFor = async (url, proxy) => {
  if(!proxy.match(/:\/\//)) proxy = 'http://' + proxy
  let socket = await new Promise ((resolve, reject) => {
    let urlParts = new URL(url)
    let proxyParts = new URL(proxy)

    let options = {
      host: proxyParts.hostname,
      port: proxyParts.port || 80,
      method: 'CONNECT',
      timeout: 10000,
      path: `${urlParts.hostname}:${portFor(url)}`, //
    }
    let req = http.request(options)

    req.once('connect', function (res, socket, head) {
      if(res.statusCode === 200){
        if(!socket){
          debugger
        }
        resolve(socket)
      } else {
        socket.destroy()
        reject()
      }
    })
    req.once('error', function (e) {
      reject(e)
    })

    req.end()
  }).catch(e => {
    // debugger
  })
  return socket
}

const request = async (url, options = {}) => {
  let socket
  let response = await new Promise(async (resolve, reject) => {
    let proxy
    let parts = new URL(url)
    let ALPNProtocols = ['h2', 'http/1.1']
    if(options.proxy) {
      proxy = options.proxy
      socket = await socketFor(url, proxy)
      if(!socket) return reject('bad proxy')
      delete options.proxy
    } else {

    }

    if(parts.protocol === 'http:'){
      resolve(await withHttp1(url, options, socket))
    } else {
      const connectOpts = proxy ? {
        socket,
        ALPNProtocols
      } : {
        host: parts.hostname,
        servername: parts.hostname,
        port: portFor(url),
        ALPNProtocols
      }
      const tlsConnection = tls.connect(connectOpts)
      tlsConnection.once('error', (e) => {
        reject(e)
      })
      tlsConnection.once('secureConnect', async () => {
        if (tlsConnection.alpnProtocol === 'h2'){
          resolve(await withHttp2(url, options, tlsConnection))
        } else {
          resolve(await withHttp1(url, options, tlsConnection))
        }
      })
    }
  }).catch(e => {
    // console.log(e)
  })

  if(socket) socket.destroy()

  if(response.headers[':status'] === 301 || response.headers[':status'] === 302){
    let location = new URL(response.headers['location'], options.url).href
    let newArgs = {...options, url: location}
    return await this.request(url, newArgs)
  }

  return response
}

class FakeBrowser{
  constructor(){
  }

  async get(url, options = {}){
    return await request(url, {
      method: 'GET',
      ...options
    })
  }

  async post(url, body, options = {}){
    return await request(url, {
      body,
      method: 'POST',
      ...options
    })
  }
}

module.exports = new FakeBrowser()