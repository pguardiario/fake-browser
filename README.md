# fake-browser
Make http2 requests that look like the real thing

```
const f = require('fake-browser')
let {headers, data} = await f.get('https://httpbin.org/ip'))
let {headers, data} = await f.post('https://httpbin.org/post', 'foo=bar'))
let {headers, data} = await f.post('https://httpbin.org/post', JSON.stringify({"foo": "bar"}), {json: true})
```