const _ = require('lodash');
const s = require('underscore.string');
const axios = require('axios');
const priceParser = require('price-parser');
const pdfJS = require('pdfjs-dist');

class Menu {
	static async extract(source) {
		const pdf = await pdfJS.getDocument(source);

		let textElements = [];
		let rawTextElements = [];

		for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
			const page = await pdf.getPage(pageNumber);
			const textContent = await page.getTextContent({
				normalizeWhitespace: true,
				disableCombineTextItems: true,
			});

			rawTextElements = rawTextElements.concat(textContent.items);
			textElements = textElements.concat(textContent.items);
		}

		return [Menu.getMenuItems(textElements), rawTextElements];
	}

	static async extractFromUrl(pdfUrl) {
		const response = await axios.get(pdfUrl, {responseType: 'stream'});

		return new Promise((resolve) => {
			const output = [];
			response.data.on('data', (chunk) => {
				output.push(chunk);
			});
			response.data.on('end', () => {
				return resolve(Menu.extract(Buffer.concat(output)));
			});
		});
	}

	static async fetchMenusFromUrl(customSearchId, siteUrl, apiKey) {
		const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
			params: {
				q: 'main menu',
				excludeTerms: 'drinks cocktails',
				fileType: 'pdf',
				sort: 'date',
				fields: 'items',
				cx: customSearchId,
				siteSearch: siteUrl,
				key: apiKey,
			},
		});
		return _.get(response, 'data.items', []);
	}

	static getMenuItems(items) {
		const clusters = [];
		let cluster = new TextCluster();

		// Merge text elements
		items.forEach((rawItem) => {
			const item = new TextItem(rawItem);

			if (!cluster.isSameCluster(item)) {
				clusters.push(cluster);
				cluster = new TextCluster();
			}

			cluster.append(item);
		});

		// Add the last remaining cluster to the menuItems if it hasn't been added before.
		if (clusters.length > 0 && !clusters.includes(cluster)) {
			clusters.push(cluster);
		}

		const clustersWithMergedPrices = [];
		clusters.forEach((cluster) => {
			if (cluster.containsOnlyPrice() && clustersWithMergedPrices.length > 0) {
				clustersWithMergedPrices[clustersWithMergedPrices.length - 1].merge(cluster);
			}
			else {
				clustersWithMergedPrices.push(cluster);
			}
		});

		// Return filtered dishes.
		return clustersWithMergedPrices.filter(cluster => !cluster.isBlank()).map(cluster => cluster.export());
	}
}

class TextCluster {
	static get MAX_SAME_LINE_ERROR_MARGIN() {return 3}
	static get MAX_DISTANCE_BETWEEN_LETTERS() {return 0.5}

	constructor() {
		this.textItems = [];
	}

	isBlank() {
		const cleanText = s(this.getTitle()).replace(/[~]/, '').replace(' ,', ',').replace(/\s\s/, ' ').clean().dedent().value();
		return !this.hasItems() || s.isBlank(_.startCase(cleanText));
	}

	export() {
		const title = this.getTitle();
		return {
			title: title,
			price: Price.fromText(title).price,
		}
	}

	getTitle() {
		let title = '';
		this.textItems.forEach((item) => {
			if (this.inTheMiddleOfWord(item)) {
				title += item.text;
			}
			else {
				title += ` ${item.text}`;
			}
		});
		return title.replace(/\s+/g, ' ').replace(' , ', ', ').trim();
	}

	append(textItem) {
		this.textItems.push(textItem);
	}

	merge(cluster) {
		this.textItems = this.textItems.concat(cluster.textItems);
	}

	hasItems() {
		return this.textItems.length > 0;
	}

	getPrevItem(item) {
		let index = this.textItems.indexOf(item);
		index = index > 0 ? index - 1 : this.textItems.length - 1;
		return this.hasItems() && index < this.textItems.length ? this.textItems[index] : null;
	}

	isSameCluster(item) {
		const itemInTheSameCluster = this.onTheSameLine(item) || this.inTheMiddleOfWord(item) || this.continuedOnNextLine(item);
		return itemInTheSameCluster && !this.sentenceEnded(item);
	}

	onTheSameLine(item) {
		const previousItem = this.getPrevItem(item);
		return previousItem && Math.abs(previousItem.y - item.y) < TextCluster.MAX_SAME_LINE_ERROR_MARGIN;
	}

	continuedOnNextLine(item) {
		const previousItem = this.getPrevItem(item);
		if (!previousItem)
			return false;

		const sameFontVariant = this.sameFont(item);
		const hasPrice = !!Price.findPriceInText(this.getTitle());
		const spaceBetweenLinesIsNotTooBig = item.y - previousItem.y > item.height;
		const isAfter = item.y > previousItem.y;
		return sameFontVariant && !!hasPrice && isAfter && spaceBetweenLinesIsNotTooBig;
	}

	containsOnlyPrice() {
		const text = this.getTitle();
		const price = Price.findPriceInText(text);
		return text === '.' || text.match(/^\d$/) || price === Number.parseFloat(text);
	}

	inTheMiddleOfWord(item) {
		const previousItem = this.getPrevItem(item);
		if (!previousItem)
			return false;

		const distanceBetweenElements = Math.abs(item.x - previousItem.x - previousItem.width);
		const isSameLine = this.onTheSameLine(item);
		return isSameLine && distanceBetweenElements < TextCluster.MAX_DISTANCE_BETWEEN_LETTERS;
	}

	sameFont(item) {
		const previousItem = this.getPrevItem(item);
		return previousItem && item.fontName === previousItem.fontName && !this.isDifferentTextCase(item);
	}

	isDifferentTextCase(item) {
		const previousItem = this.getPrevItem(item);
		if (!previousItem)
			return false;

		const previousIsUppercase = previousItem.text === previousItem.text.toUpperCase();
		const itemIsUppercase = item.text === item.text.toUpperCase();
		return previousIsUppercase !== itemIsUppercase;
	}

	sentenceEnded(item) {
		const previousItem = this.getPrevItem(item);
		return previousItem && previousItem.text && previousItem.text.length > 0 && previousItem.text[previousItem.text.length - 1] === '.';
	}
}

class Price {
	static fromText(text) {
		const price = new Price();
		price.price = Price.findPriceInText(text);
		return price;
	}

	static findPriceInText(text) {
		const price = priceParser.parseFirst(text.replace(/\s+/g, ' ').trim());
		const numberRegex = /(\d+([.,]\d+)?)+/g;
		const yearRegex = /^\d{4}$/g;

		// Source: https://stackoverflow.com/questions/29434666/how-to-parse-and-capture-any-measurement-unit
		const numberUnitRegex = /([+\-])?((?:\d+\/|(?:\d+|^|\s)\.)?\d+)\s*([^\s\d+\-.,:;^\/]+(?:\^\d+(?:$|(?=[\s:;\/])))?(?:\/[^\s\d+\-.,:;^\/]+(?:\^\d+(?:$|(?=[\s:;\/])))?)*)?/g;

		if (price) {
			return price.floatValue;
		}
		else {
			const priceMatches = text.match(numberRegex);
			let numberUnitMatch = text.match(numberUnitRegex);

			if (numberUnitMatch) {
				numberUnitMatch = numberUnitMatch.map(item => item.trim());
			}

			if (priceMatches) {
				const prices = priceMatches.filter(element => numberUnitMatch.includes(element));
				if (prices.length > 0 && !yearRegex.exec(prices[0])) {
					return Number.parseFloat(prices[0]);
				}
				return null;
			}
		}

		return null;
	}
}

/**
 * Representation of a single text element from a PDF file.
 * The main purpose of this class is to create clusters of related text elements.
 *
 * @param {object} rawItem
 * @param {object} previousItem
 */
class TextItem {
	constructor(rawItem) {
		const [t0, t1, t2, t3, x, y] = rawItem.transform;
		this.x = x;
		this.y = y;

		this.width = rawItem.width;
		this.height = rawItem.transform[0];

		this.text = rawItem.str.replace(/\s+/g, ' ');
		this.fontName = rawItem.fontName;

		this.rawItem = rawItem;
	}
}

module.exports = {Price, Menu};