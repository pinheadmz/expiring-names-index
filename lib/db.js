'use strict';

const bdb = require('bdb');
const Path = require('path');

class DB {
  constructor () {
    this.db = bdb.create({
      memory: false,
      location: Path.join(__dirname, '..', 'data')
    });

    this.layout = {
      // T -> Chain height (latest block event received)
      T: bdb.key('T'),
      // N[name] -> renewal height (ns.renewal) by name
      N: bdb.key('N', ['ascii']),
      // R[height][name] -> dummy (name by renewal height)
      R: bdb.key('R', ['uint32', 'ascii'])
    };
  }

  open() {
    return this.db.open();
  }

  start() {
    return this.db.batch();
  }

  async commit(b) {
    return b.write();
  }

  async saveHeight(b, chainTip) {
    b.put(this.layout.T.encode(), ntob(chainTip));
  }

  async getHeight() {
    const chainTip = await this.db.get(this.layout.T.encode());
    return {
      chainTip: bton(chainTip)
    };
  }

  async saveName(b, name, height) {
    // Remove old record if it exists
    const oldHeight = await this.db.get(this.layout.N.encode(name));
    if (oldHeight) {
      b.del(
        this.layout.R.encode(
          bton(oldHeight),
          name
        )
      );
    }

    // Insert/Update
    b.put(this.layout.R.encode(height, name), null);
    b.put(this.layout.N.encode(name), ntob(height));
  }

  async getExpiring(limit) {
    const items = await this.db.keys({
      limit,
      gte: this.layout.R.min(),
      lte: this.layout.R.max()
    });

    const ret = {};
    for (const item of items) {
      const [height, name] = this.layout.R.decode(item);
      if (!ret[height])
        ret[height] = [name];
      else
        ret[height].push(name);
    }

    // Make sure last block of expiring names is complete
    const last = Object.keys(ret)[Object.keys(ret).length - 1];
    delete ret[last];

    return ret;
  }
}

/*
 * HELPERS
 */

function ntob(number) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(number);
  return buf;
}

function bton(buffer) {
  if (!buffer)
    return 0;

  return buffer.readUInt32BE();
}

module.exports = DB;
