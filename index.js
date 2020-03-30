const http2 = require('http2')
const http = require('http')
const zlib = require('zlib')
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

  async httpRequest(options){
    const url = new URL(options.url)
    return await new Promise((resolve, reject) => {

    const o = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: options.method,
      headers: {...this.baseHeaders, ...(options.headers || {})}
    };

    const req = http.request(o, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      });

      res.on('end', () => {
        resolve({headers:res.headers, data})
      });
    });

    req.on('error', (e) => {
      console.error(`problem with request: ${e.message}`);
    });

    // Write data to request body
    // req.write(postData);
    req.end();

    })

  }

  async request(options){
    const url = new URL(options.url)
    if(url.protocol === 'http:') return await this.httpRequest(options)
    let response = await new Promise((resolve, reject) => {
      const client = http2.connect(url.protocol + '//' + url.host, {
        // ca: fs.readFileSync('localhost-cert.pem')
      })

      client.on('error', (err) => reject(err));

      const args = {
        ':path': url.pathname + url.search,
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
        let buffers = []

        stream.on('data', (chunk) => {
          buffers.push(chunk)
        })

        stream.on('end', () => {
          client.close()
          resolve({headers, data: Buffer.concat(buffers)})
        })

      })

      if(options.method === 'POST'){
        req.write(options.body)
      }

      req.end();

    })
    if(response.headers[':status'] === 301){
      let location = new URL(response.headers['location'], options.url).href
      let newArgs = {...options, url: location}
      return await this.request(newArgs)
    }
    return response
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

; (async() => {
  let f = new FakeBrowser('chrome', {})
  // let response = await f.get('http://httpbin.org/')
  let response = await f.get("https://www.themoviedb.org/tv/60694?language=en-US")
  // let response = await f.get("https://www.themoviedb.org/tv/60694-last-week-tonight-with-john-oliver?language=en-US")
  // require('fs').writeFileSync('x.jpg', response.data)
  // let {headers, data} = await f.post('https://www.amazon.com/', JSON.stringify({"foo": "bar"}), {json: true})
  debugger
})()
