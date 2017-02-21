const fs = require('fs');
const http = require('http');
const EventEmitter = require('events');

const maxterm = 5;
const dirname = 'IoTDataModels';

// executes HTTP GET operations one after the other
class HTTPIterator extends EventEmitter {

	constructor(urls) {
		super();
		this.iterator = urls[Symbol.iterator]();
	}

	on(event, cb) {
		return super.on(event, () => {
			if (event === 'next') {
				var elem = this.iterator.next();
				if (elem.done) {
					this.emit('end');
				} else {
					var url = elem.value;
					http.get(url, res => {
						res.setEncoding('utf-8');
						var data = '';
						res.on('data', chunk => data += chunk);
						res.on('end', () => cb(url, data));
					});
				}
			} else if (event === 'end') {
				cb();
			}
		});
	}

}

var filemap = {};
fs.readdirSync(dirname)
	.filter(f => f.endsWith('.raml'))
	.forEach(f => {
		// split camel case
		var terms = f
			.replace('.raml', '')
			.replace(/([a-z])([A-Z])/, '$1 $2')
			.split(' ')
			.map(t => t.toLowerCase());;

		// query Linked Open Vocabulary (LOV) platform
		var q = terms.reduce((q, t) => q.length > 0 ? q + '+' + t : t, '');
		var url = 'http://lov.okfn.org/dataset/lov/api/v2/term/search?' +
			'q=' + q + '&' +
			'page_size=' + maxterm;
		filemap[url] = f;
	});

var concepts = {
	vocabs: {}, // aggregated count
	terms: {}   // found terms (uri, curi)
};
var iterator = new HTTPIterator(Object.keys(filemap))
	.on('next', (url, data) => {
		var json = JSON.parse(data);
		var f = filemap[url];
		concepts.terms[f] = json.results;
		json.results.forEach(r => {
			var prefix = r['vocabulary.prefix'];
			if (!concepts.vocabs[prefix]) {
				concepts.vocabs[prefix] = 0;
			}
			concepts.vocabs[prefix]++;
		});
		iterator.emit('next');
	})
	.on('end', () => {
		// generate markdown
		var filename = dirname + '-LOV.md';
		var md = '| oneIoTA Model | LOV Concepts |\n' +
			'| --- | --- |\n';
		for (f in concepts.terms) {
			var list = concepts.terms[f].reduce((terms, t) => {
				return terms +
					(terms.length > 0 ? ', ' : '') +
					'[' + t.prefixedName[0] + ']' +
					'(' + t.uri[0] + ')';
			}, '');
			md += '| ' + f + ' | ' + list + ' |\n';
		}
		md += '\n';
		md += '| LOV Vocabulary | Number of occurrence |\n' +
			'| --- | --- |\n';
		for (prefix in concepts.vocabs) {
			var link = '[' + prefix + '](http://lov.okfn.org/dataset/lov/vocabs/' + prefix + ')';
			md += '| ' + link + ' | ' + concepts.vocabs[prefix] + ' |\n';
		}
		fs.writeFileSync(filename, md, 'utf-8');
	});
iterator.emit('next');
