(function (root) {

  // Store setTimeout reference so promise-polyfill will be unaffected by
  // other code modifying setTimeout (like sinon.useFakeTimers())
  var setTimeoutFunc = setTimeout;

  function noop() {}
  
  // Polyfill for Function.prototype.
  // 模拟原生bind函数，这里并没有完全实现原生的bind函数所有的功能，比如thisArg后面其实还可以跟参数
  function bind(fn, thisArg) {
    return function () {
      fn.apply(thisArg, arguments);
    };
  }
  // Promise构造函数
  function Promise(fn) {
    // 这种检测是否使用new去调用函数的形式不太正确，可以使用如下
    // !(this instanceof Promise)
    if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new');
    // fn必须是一个函数
    if (typeof fn !== 'function') throw new TypeError('not a function');
    /**
     * this._state promise的状态
     * 0  pendding
     * 1  success
     * 2  reject
     * 3  过渡态
     */
    this._state = 0;
    // promise是否已经被处理 success or failure都认为是已经被处理
    this._handled = false;
    // Promise成功或者失败回调函数的接收值
    this._value = undefined;
    this._deferreds = [];

    doResolve(fn, this);
  }

  // .then回调函数执行逻辑

  function handle(self, deferred) {
    // state为3表示resolve时传入的是一个Promise的实例
    // 这种情况需要根据传入的Promise的状态及其值，选择上一个Promise的成功或者失败的回调去执行
    while (self._state === 3) {
      self = self._value;
    }
    if (self._state === 0) {
      self._deferreds.push(deferred);
      return;
    }
    self._handled = true;
    Promise._immediateFn(function () {
      var cb = self._state === 1 ? deferred.onFulfilled : deferred.onRejected;
      if (cb === null) {
        (self._state === 1 ? resolve : reject)(deferred.promise, self._value);
        return;
      }
      var ret;
      try {
        // onFulfilled 当 promise 执行结束后其必须被调用，其第一个参数为 promise 的终值
        // onRejected 当 promise 被拒绝执行后其必须被调用，其第一个参数为 promise 的据因
        ret = cb(self._value);
      } catch (e) {
        reject(deferred.promise, e);
        return;
      }
      resolve(deferred.promise, ret);
    });
  }

  // Promise 解决过程
  // 运行 [[Resolve]](promise, x)

  function resolve(self, newValue) {
    try {
      // Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
      // 如果 promise 和 x 指向同一对象，以 TypeError 为据因拒绝执行 promise (暂时不清楚这种情况如何出现)
      if (newValue === self) throw new TypeError('A promise cannot be resolved with itself.');
      if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
        var then = newValue.then;
        // newValue 为 Promise
        if (newValue instanceof Promise) {
          self._state = 3;
          self._value = newValue;
          finale(self);
          return;
        } else if (typeof then === 'function') {
          doResolve(bind(then, newValue), self);
          return;
        }
      }
      self._state = 1;
      self._value = newValue;
      finale(self);
    } catch (e) {
      reject(self, e);
    }
  }

  // 将Promise的状态设定为2即失败状态，并且将_value值设置为对应的"失败理由"

  function reject(self, newValue) {
    self._state = 2;
    self._value = newValue;
    finale(self);
  }

  function finale(self) {
    if (self._state === 2 && self._deferreds.length === 0) {
      Promise._immediateFn(function() {
        if (!self._handled) {
          Promise._unhandledRejectionFn(self._value);
        }
      });
    }

    for (var i = 0, len = self._deferreds.length; i < len; i++) {
      handle(self, self._deferreds[i]);
    }
    self._deferreds = null;
  }

  // Handler 主要存储.then函数输入的onFulfilled, onRejected函数以及new Promise的实例

  function Handler(onFulfilled, onRejected, promise) {
    this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
    this.onRejected = typeof onRejected === 'function' ? onRejected : null;
    this.promise = promise;
  }

  /**
   * Take a potentially misbehaving resolver function and make sure
   * onFulfilled and onRejected are only called once.
   *
   * Makes no guarantees about asynchrony.
   */
  /*
  new Promise(function (resolve, reject) {
    if (1) {
      resolve(1)
    } else {
      reject(0)
    }
  })
  */
  function doResolve(fn, self) {
    // done 保证resolve和reject只能执行一次，从而保证Promise规范中只能从pendding到success或者failure
    var done = false;
    try {
      fn(function (value) {
        // done为true表示已经resolve过，即Promise状态已经变成success
        if (done) return;
        done = true;
        resolve(self, value);
      }, function (reason) {
        // done为true表示已经resolve过，即Promise状态已经变成failure
        if (done) return;
        done = true;
        reject(self, reason);
      });
    } catch (ex) {
      // 如果执行fn过程出现错误，将错误捕获，并执行reject函数
      if (done) return;
      done = true;
      reject(self, ex);
    }
  }

  // 部分老式浏览器在obj.catch会报错，故obj['catch']
  // 原型方法catch

  Promise.prototype['catch'] = function (onRejected) {
    return this.then(null, onRejected);
  };

  Promise.prototype.then = function (onFulfilled, onRejected) {
    var prom = new (this.constructor)(noop);

    handle(this, new Handler(onFulfilled, onRejected, prom));
    return prom;
  };

  Promise.all = function (arr) {
    var args = Array.prototype.slice.call(arr);

    return new Promise(function (resolve, reject) {
      if (args.length === 0) return resolve([]);
      var remaining = args.length;

      function res(i, val) {
        try {
          if (val && (typeof val === 'object' || typeof val === 'function')) {
            var then = val.then;
            if (typeof then === 'function') {
              then.call(val, function (val) {
                res(i, val);
              }, reject);
              return;
            }
          }
          args[i] = val;
          if (--remaining === 0) {
            resolve(args);
          }
        } catch (ex) {
          reject(ex);
        }
      }

      for (var i = 0; i < args.length; i++) {
        res(i, args[i]);
      }
    });
  };

  // resolve静态方法

  Promise.resolve = function (value) {
    // 如果value本身是Promise的实例，直接返回
    if (value && typeof value === 'object' && value.constructor === Promise) {
      return value;
    }
    // 否则新创建一个Promise的实例并且将传入的值作为resolve的值
    return new Promise(function (resolve) {
      resolve(value);
    });
  };

  // reject静态方法

  Promise.reject = function (value) {
    return new Promise(function (resolve, reject) {
      reject(value);
    });
  };

  Promise.race = function (values) {
    return new Promise(function (resolve, reject) {
      for (var i = 0, len = values.length; i < len; i++) {
        values[i].then(resolve, reject);
      }
    });
  };

  // Use polyfill for setImmediate for performance gains
  Promise._immediateFn = (typeof setImmediate === 'function' && function (fn) { setImmediate(fn); }) ||
    function (fn) {
      setTimeoutFunc(fn, 0);
    };

  Promise._unhandledRejectionFn = function _unhandledRejectionFn(err) {
    if (typeof console !== 'undefined' && console) {
      console.warn('Possible Unhandled Promise Rejection:', err); // eslint-disable-line no-console
    }
  };

  /**
   * Set the immediate function to execute callbacks
   * @param fn {function} Function to execute
   * @deprecated
   */
  Promise._setImmediateFn = function _setImmediateFn(fn) {
    Promise._immediateFn = fn;
  };

  /**
   * Change the function to execute on unhandled rejection
   * @param {function} fn Function to execute on unhandled rejection
   * @deprecated
   */
  Promise._setUnhandledRejectionFn = function _setUnhandledRejectionFn(fn) {
    Promise._unhandledRejectionFn = fn;
  };
  
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Promise;
  } else if (!root.Promise) {
    root.Promise = Promise;
  }

})(this);
