const _ = require('lodash');
const perfectionist = require('perfectionist');
const namer = require('color-namer');
const scss = require('sass');

let _colorObj: any = {};
let _mainSCSS: any = '';
let _mainCharset: any = '';

const _cssToSingleLine = (contents: any) => contents.replace(/^\s*\/\/.*/gm, '').replace(/\/\*.*\*\//g, '').replace(/(?:\r\n|\r|\n)/g, '');

const _processCssHead = (headContent: any) => {
  const trimmedHead = headContent.trim();
  let parsedHeadContent = trimmedHead;

  if (trimmedHead.substr(0, 6) !== '@media') {
    parsedHeadContent = trimmedHead
      .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/g, '')
      .replace(/"/g, '\\"')
      .replace(/([^\s\(])(\.)([^\s])/g, '$1{&$2$3')
      .replace(/(\s*::\s*)(?=([^\(]*\([^\(\)]*\))*[^\)]*$)/g, '{&:')
      .replace(/([^&])\s*:\s*(?=([^\(]*\([^\(\)]*\))*[^\)]*$)/g, '$1{&:')
      .replace(/(\s*>\s*)/g, '{>')
      .replace(/(\s*\+\s*)/g, '{+')
      .replace(/\s(?=([^"]*"[^"]*")*[^"]*$)/g, '{')
      .replace(/(\s*{\s*)/g, '":{"');
  }

  return `"${parsedHeadContent}"`;
};


const _processCssBody = (bodyContent: any) => {
  const bodyContentArr = bodyContent.replace(/(\s*;(?![a-zA-Z\d]+)\s*)(?=([^\(]*\([^\(\)]*\))*[^\)]*$)/g, '~').split('~');
  console.log('bodyContentArr', bodyContentArr);
  let cumulator = '';

  bodyContentArr.forEach((attribute: any) => {
    if (attribute.length > 1) {
      const pullColorVar = attribute.match(/[^0-9A-Za-z]+(#[0-9A-Fa-f]{3,6})/);
      let modAttribute = attribute;

      if (pullColorVar != null) {
        const colorVar = pullColorVar[1];
        const colorName = namer(colorVar).html[0].name + colorVar.replace('#', '_');
        _colorObj[`$${colorName}`] = `${colorVar}`;
        modAttribute = attribute.replace(/([^0-9A-Za-z]+)(#[0-9A-Fa-f]{3,6})/, `$1$${colorName}`);
      }

      cumulator += `"${modAttribute.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/(\s*;\s*)(?=([^\(]*\([^\(\)]*\))*[^\)]*$)/g, '","').replace(/(\s*:\s*)/, '":"')
        .trim()}",`;
    }
  });

  return cumulator.substr(0, cumulator.length - 1);
};


const _cssToArray = (css: any) => {
  let level = 0;
  let cumuloString = '';
  const cssArray = [];


  for (let i = 0; i <= css.length; i++) {
    const char = css[i];
    cumuloString += char;
    if (char === '{') {
      level += 1;
    } else if (char === '}') {
      level -= 1;
      if (level === 0) {
        cssArray.push(cumuloString);
        cumuloString = '';
      }
    }
  }

  return cssArray;
};


const _cssarrayToObject = (fileContentsArr: any) => {
  const mainObject = {};

  fileContentsArr.forEach((value: any) => {
    const head = value.match(/(.*?){/)[1];
    const tail = value.match(/{(.*)}/)[1];

    const cleanHead = head.trim();
    let dividedHead;
    if (cleanHead.substr(0, 1) === '@') {
      dividedHead = [cleanHead];
    } else {
      dividedHead = cleanHead.split(',');
    }

    dividedHead.forEach((headvalue: any) => {
      if (head.length > 0) {
        let processedHead = _processCssHead(headvalue);
        let processedBody = '';

        if (processedHead.substr(0, 2) === '"@') {
          processedHead = `"${headvalue}"`;
          processedBody = JSON.stringify(_cssarrayToObject(_cssToArray(tail)));
          processedBody = processedBody.substr(1, processedBody.length - 2);
        } else {
          processedBody = _processCssBody(tail);
        }

        const closingBracketsInHead = (processedHead.match(/{/g) || []).length;

        const completeClause = `${processedHead}:{${processedBody}${'}'.repeat(closingBracketsInHead + 1)}`;


        const objectClause = JSON.parse(`{${completeClause}}`);
        _.merge(mainObject, objectClause);
      }
    });
  });

  return mainObject;
};


const _objectContainsObject = (objectVal: any) => {
  let containsObject = false;
  const keychain = Object.keys(objectVal);

  keychain.forEach((key) => {
    if (typeof objectVal[key] === 'object'){
      containsObject = true;
    }
  });

  return containsObject;
};


const _cssObjectToCss = (contentObject: any) => {
  const keychain = Object.keys(contentObject);


  if (!_objectContainsObject(contentObject)) {
    keychain.sort();
  }

  keychain.forEach((key) => {
    if (typeof contentObject[key] === 'object') {
      _mainSCSS += `${key}{`;
      _cssObjectToCss(contentObject[key]);
      _mainSCSS += '}';
    } else {
      _mainSCSS += `${key}:${contentObject[key]};`;
    }
  });
};


const _objToKeyValueCss = (objectVal: any) => {
  if (typeof objectVal === 'object') {
    const keychain = Object.keys(objectVal);

    if (keychain.length > 0) {
      keychain.sort();

      let stringOutput = '';

      keychain.forEach((key) => {
        stringOutput += `${key}:${objectVal[key]};`;
      });


      return stringOutput;
    }
  }
  return '';
};


const convertCssToObject = (cssContent: any) => {
  let plainCss;
  try {
    plainCss = scss.renderSync({
      data: cssContent,
    }).css.toString();
  } catch (error) {
    console.log('Error', 'The source CSS is not valid');
  }

  let singleLineCss = _cssToSingleLine(plainCss);
  const charsetRegexp = /^@charset\s\"([^\"]+)\";/;
  const matches = charsetRegexp.exec(singleLineCss);
  if (Array.isArray(matches) && matches[1]) {
    _mainCharset = matches[1];
    singleLineCss = singleLineCss.replace(charsetRegexp, '');
  }

  const cssArray = _cssToArray(singleLineCss);
  try {
    return _cssarrayToObject(cssArray);
  } catch (error) {
    console.log('Error', 'There was a problem converting the CSS to an Object');
  }

  return true;
};


const convertCssToScss = (cssContent: any) => {
  _mainSCSS = '', _mainCharset = '', _colorObj = {};
  const cssObject = convertCssToObject(cssContent);
  _cssObjectToCss(cssObject);
  const charset = _mainCharset ? `@charset "${_mainCharset}";\n` : '';
  const colorVars = _objToKeyValueCss(_colorObj);
  const completedProcessing = charset + colorVars + _mainSCSS;
  const cleanResult = perfectionist.process(completedProcessing, { indentSize: 2, colorShorthand: false });
  return cleanResult.css;
};


module.exports = {
  _processCssHead, _processCssBody, convertCssToObject, convertCssToScss,
};
