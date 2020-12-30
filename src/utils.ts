import { typeOf, deepClone } from '@ygkit/object';
import { AnyObject } from './typings';

const isUndefined = (val: any): boolean => {
  return val === undefined;
};

const isObject = (obj: AnyObject): boolean => {
  return typeOf(obj) === 'Object';
};

const isEmptyObject = (obj: AnyObject): boolean => {
  return Object.keys(obj).length === 0;
};

const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, ms);
  });
};

export { sleep, typeOf, deepClone, isObject, isUndefined, isEmptyObject };
