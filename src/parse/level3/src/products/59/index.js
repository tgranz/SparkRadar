const code = 59;
const abbreviation = ['NHI'];
const description = 'Hail Index';
import formatter from './formatter.js';

// 124 Nmi, Geographic and Non-geographic alphanumeric

const product = {
	code,
	abbreviation,
	description,
	formatter,

	productDescription: {
	},
};

if (typeof module !== 'undefined') {
	module.exports = product;
}

export default product;
export { code, abbreviation, description, formatter };
