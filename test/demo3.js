let Promise = require('../promise')

let p1 = new Promise((resolve, reject) => {
  reject(('error'))
})

let p2 = p1.then((res) => {
  throw 'dsffd'
}, (err) => {
  console.log(err)
})

p2.then(() => {
  console.log(333)
})

