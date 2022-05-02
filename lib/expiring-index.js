'use strict';

const {NodeClient} = require('hs-client');
const DB = require('./db');
const HTML = require('./html');
const {ChainEntry, Network} = require('hsd');

class Indexer {
  constructor(options) {
    this.network = Network.get(options.network || 'regtest');
    this.hsd = new NodeClient({
      port: this.network.rpcPort
    });
    this.db = new DB();
    this.html = new HTML({
      network: this.network
    });
  }

  async open() {
    await this.db.open();
    await this.hsd.open();

    let {chainTip} = await this.db.getHeight();

    const raw = await this.hsd.getTip();
    const tip = ChainEntry.decode(raw);

    console.log('Syncing from node...');
    for (; chainTip <= tip.height; chainTip++)
      await this.addBlock(chainTip);

    await this.generate(tip.height);
    console.log('Synced!');

    this.hsd.bind('chain connect', async (entry) => {
      const {height} = ChainEntry.decode(entry);
      await this.addBlock(height);
      await this.generate(height);
    });
    this.hsd.bind('chain disconnect', async (entry) => {
      const {height} = ChainEntry.decode(entry);
      await this.addBlock(height);
      await this.generate(height);
    });

    console.log('Ready.');
  }

  async generate(chainTip) {
    console.log('Generating HTML...');
    const map = await this.db.getExpiring(
      200,
      chainTip - this.network.names.renewalWindow - 100
    );
    this.html.generate(map, chainTip);
  }

  async addBlock(chainTip) {
    if (chainTip < this.network.txStart)
      return;

    const block = await this.hsd.getBlock(chainTip);
    const nameHashes = this.filterNames(block);

    const b = this.db.start();

    console.log(`Saving block: ${chainTip}`);
    this.db.saveHeight(b, chainTip);

    for (const nameHash of nameHashes) {
      const buf = Buffer.from(nameHash, 'hex');
      const ns = await this.hsd.getNameStatus(buf);
      if (ns.claimed)
        continue;

      await this.db.saveName(b, ns.name, ns.renewal);
    }

    await this.db.commit(b);
    return;
  }

  filterNames(block) {
    const set = new Set();
    for (const tx of block.txs) {
      for (const {covenant} of tx.outputs) {
        switch (covenant.action) {
          case 'CLAIM':
          case 'REVEAL': // OPEN without REVEAL doesn't expire, has no owner
          case 'REGISTER':
          case 'RENEW':
          case 'FINALIZE':
            set.add(covenant.items[0]);
        }
      }
    }

    return set;
  }
}

module.exports = Indexer;
