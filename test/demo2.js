// 检测 resolve(promise)
const Promise = require('../promise')

// let p1 = Promise.resolve('resolve p1')
let p1 = Promise.reject('reject p1')
let p2 = new Promise((resolve, reject) => {
  resolve(p1)
})

p2.then((res) => {
  console.log(res)
}).catch((ex) => {
  console.log(ex)
})