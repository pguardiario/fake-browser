const http2 = require('http2');
const zlib = require('zlib');
const { PassThrough } = require('stream')

class FakeBrowser{
  constructor(ua = chrome, options = {}){
    this.baseHeaders = {
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
  }

  async request(options){
    return await new Promise((resolve, reject) => {
      const url = new URL(options.url)
      const client = http2.connect(url.protocol + '//' + url.host, {
        // ca: fs.readFileSync('localhost-cert.pem')
      })

      client.on('error', (err) => reject(err));

      const args = {
        ':path': url.pathname,
        ':method': options.method,
        ...this.baseHeaders
      }

      if(options.method === 'POST'){
        args["Content-Type"] = options.json ? "application/json" : "application/x-www-form-urlencoded"
      }

      const req = client.request( args )

      req.on('response', (headers, flags) => {

        let stream = new PassThrough()

        switch(headers["content-encoding"]){
          case 'gzip':
            req.pipe(zlib.createGunzip()).pipe(stream)
            break
          case 'deflate':
            req.pipe(zlib.Inflate()).pipe(stream)
            break
          case 'br':
            req.pipe(zlib.BrotliDecompress()).pipe(stream)
            break
          default:
            req.pipe(stream)
            break
        }

        // req.setEncoding('utf8');
        let data = '';

        stream.on('data', (chunk) => {
          data += chunk
        })

        stream.on('end', () => {
          client.close();
          resolve({headers, data})
        })

      })

      if(options.method === 'POST'){
        req.write(options.body)
      }

      req.end();

    })
  }

  async get(url, options = {}){
    return await this.request({
      url,
      method: 'GET',
      ...options
    })
  }

  async post(url, body, options = {}){
    return await this.request({
      url,
      body,
      method: 'POST',
      ...options
    })
  }
}

module.exports = new FakeBrowser('chrome', {})

// ; (async() => {
//   let f = new FakeBrowser('chrome', {})
//   // let response = await f.get('https://www.amazon.com/')
//   let response = await f.get('https://www.google.com/')
//   // let {headers, data} = await f.post('https://www.amazon.com/', JSON.stringify({"foo": "bar"}), {json: true})
//   debugger
// })()
