const fs = require('fs');
const path = require('path');
const {Menu} = require('./index');

const menusDir = './test/menus';
const fixturesDir = './test/parsed';

function writeOutput(filename, output) {
	const outputFilename = `${fixturesDir}/${filename}.json`;

	fs.writeFile(outputFilename, output, (err) => {
		if (err) {
			return console.error(err);
		}
		console.log(`Output was saved to ${outputFilename}`)
	})
}

fs.readdir(menusDir, (err, files) => {
	files.forEach(async (menuFilename) => {
		if (path.extname(menuFilename) === '.pdf') {
			try {
				const [menuItems, rawTextElements] = await Menu.extract(`${menusDir}/${menuFilename}`);
				writeOutput(path.parse(menuFilename).name, JSON.stringify(menuItems, null, 2));
			}
			catch (error) {
				console.error(error);
			}
		}
	});
});
