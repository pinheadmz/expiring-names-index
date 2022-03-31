'use strict';

const path = require('path');
const fs = require('fs');
const punycode = require('punycode');

class HTML {
  constructor(options) {
    this.network = options.network;

    this.page = fs.readFileSync(
      path.join(__dirname, 'template-page.html'),
      'utf-8'
    );
    this.table = fs.readFileSync(
      path.join(__dirname, 'template-table.html'),
      'utf-8'
    );
    this.output = path.join(__dirname, '..', 'www', 'piring.html');
  }

  generate(map, chainTip) {
    let tables = '';

    for (const height of Object.keys(map).sort((a, b) => {return parseInt(a) > parseInt(b)})) {
      const expireHeight = parseInt(height) + this.network.names.renewalWindow;
      const time = Math.abs(chainTip - expireHeight) / 144;
      const days = parseInt(time);
      const hours = parseInt((time - days) * 24);
      const relative =
        expireHeight > chainTip ?
          'from now' :
          'ago';

      const names = map[height];
      let list = '';
      for (const name of names) {
        let str = String(name);
        const uni = punycode.toUnicode(str);
        if (str !== uni)
          str += ` (${uni})`;
        list += `${str}\n`;
      }

      const table = this.table
        .replace('{{HEIGHT}}', expireHeight)
        .replace('{{DAYS}}', days)
        .replace('{{HOURS}}', hours)
        .replace('{{RELATIVE}}', relative)
        .replace('{{NAMES}}', list);

      tables += table;
    }

    const final = this.page.replace('{{TABLES}}', tables);
    fs.writeFileSync(this.output, final, 'utf-8');
  }
}

module.exports = HTML;
