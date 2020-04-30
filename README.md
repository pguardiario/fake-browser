# fake-browser
Make http2 requests that look like the real thing

```
const f = require('fake-browser')
let {headers, data} = await f.get('https://httpbin.org/ip')
let {headers, data} = await f.get('https://httpbin.org/ip', { proxy: localhost:8888 })
let {headers, data} = await f.post('https://httpbin.org/post', 'foo=bar')

```

# Goals:
- h2, https and http
- proxy support for all 3
- look exactly like real chrome requests
- fast
- zero dependencies