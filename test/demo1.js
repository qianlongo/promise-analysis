const Promise = require('../promise')

const p = new Promise((resolve, reject) => {
  resolve(1)
})

p.then((res) => {
  console.log(res3)
}).catch((e) => {
  console.log(e)
})