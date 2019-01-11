const assert = require('assert');
const {Menu, Price} = require('../index');

const REMOTE_PDFS = {
	menu_1: 'https://static1.squarespace.com/static/5a98a5122487fd4025708054/t/5bb5a037085229db6ff943ae/1538629688352/Half+Acre+retail+menu_OCT+18.pdf',
	menu_2: 'https://content.static-bookatable.com/ServePromotionAttachment.aspx?id=102550',
	menu_3: 'https://content.static-bookatable.com/ServePromotionAttachment.aspx?id=87935',
	menu_4: 'https://static1.squarespace.com/static/551a6bebe4b06b4b5197249d/t/5bbe786d15fcc00b2627f0b7/1539209328552/GROS-Menu_Dine_11.pdf',
	menu_5: 'https://content.staticatic-bookatable.com/ServePromotionAttachment.aspx?id=106359',
	menu_6: 'https://www.hippodromecasino.com/wp-content/uploads/2018/10/Heliot-A-la-carte-OCT-18.pdf',
	menu_7: 'http://www.templebrewhouse.com/wp-content/uploads/sites/44/2018/06/TBH-FOOD-MENU-JUNEJULY-PDF.pdf',
	menu_8: 'http://www.almostfamousburgers.com/PDF/AFNQ_FOOD_MENU.pdf',
	menu_9: 'https://dagiua.com/menu.pdf',
	menu_10: 'http://www.therealgreek.com/wp-content/uploads/2018/10/TRG180-Vegan-Menu-A4_14.0.pdf',
};

describe('Menu extractor', () => {
	const menuNames = Object.keys(REMOTE_PDFS);

	describe('Remote file', () => {
		const menu = 'menu_1';
		it(`It should extract menu items from a remote URL ${menu}`, () => {
			return Menu.extractFromUrl(REMOTE_PDFS[menu]).then((data) => {
				const [menuItems, rawItems] = data;
				const menuOutputFixture = require(`./parsed/${menu}`);
				assert.deepEqual(menuItems, menuOutputFixture);
			});
		});
	});

	describe('Local file', () => {
		menuNames.forEach((menu) => {
			it(`It should extract menu items from ${menu}`, () => {
				return Menu.extract(`./test/menus/${menu}.pdf`).then(data => {
					const [menuItems, rawItems] = data;
					const menuOutputFixture = require(`./parsed/${menu}`);
					assert.deepEqual(menuItems, menuOutputFixture);
				});
			});
		});
	});

	describe('Price extraction', () => {
		it('It should extract price from text', () => {
			assert.equal(Price.findPriceInText('2 for 1'), 1);
			assert.equal(Price.findPriceInText('6PM'), null);
			assert.equal(Price.findPriceInText('600g'), null);
			assert.equal(Price.findPriceInText('6 oz'), null);
			assert.equal(Price.findPriceInText('15%'), null);
			assert.equal(Price.findPriceInText('Porterhouse 250g'), null);
			assert.equal(Price.findPriceInText('World war II started in 1939'), null);
			assert.equal(Price.findPriceInText('Two sizes 250g/400g for 39/59'), null);

			assert.equal(Price.findPriceInText('600'), 600);
			assert.equal(Price.findPriceInText('012.34'), 12.34);
			assert.equal(Price.findPriceInText('$12.34'), 12.34);
			assert.equal(Price.findPriceInText('$12,34'), 12.34);
			assert.equal(Price.findPriceInText('$12.00'), 12.00);
			assert.equal(Price.findPriceInText('$12'), 12);
			assert.equal(Price.findPriceInText('12€'), 12);
			assert.equal(Price.findPriceInText('12,11€'), 12.11);
			assert.equal(Price.findPriceInText('12.99€'), 12.99);
			assert.equal(Price.findPriceInText('12.9€'), 12.9);
			assert.equal(Price.findPriceInText('£999.99€'), 999);
			assert.equal(Price.findPriceInText('Now £30! Before £20!'), 30);
		});
	});

	describe('Fetch menu from website', () => {
		const apiKey = process.env.GOOGLE_API_KEY;
		const customSearchId = process.env.GOOGLE_CUSTOM_SEARCH_ID;

		const menusToFind = [
			{website: 'https://www.hippodromecasino.com', menu: 'https://www.hippodromecasino.com/wp-content/uploads/2018/10/Heliot-A-la-carte-OCT-18.pdf'},
			{website: 'http://www.almostfamousburgers.com', menu: 'http://www.almostfamousburgers.com/PDF/AFNQ_FOOD_MENU.pdf'},
			{website: 'https://dagiua.com', menu: 'https://dagiua.com/menu.pdf'},
			{website: 'http://www.therealgreek.com', menu: 'http://www.therealgreek.com/wp-content/uploads/2018/10/TRG180-Vegan-Menu-A4_14.0.pdf'},
		];

		menusToFind.forEach((menuToFind) => {
			it(`It should fetch PDF menu from ${menuToFind.website}`, () => {
				return Menu.fetchMenusFromUrl(customSearchId, menuToFind.website, apiKey).then(menus => {
					const menuFound = menus.some(menu => menu.link === menuToFind.menu);
					assert.equal(true, menuFound);
				});
			});
		});
	});
});