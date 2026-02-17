const code = 62;
const abbreviation = ['NSS'];
const description = 'Storm Structure';

// not much work to do for this product
// the data resides in the headers directly
// see symbology6.js and graphic22.js

const product = {
	code,
	abbreviation,
	description,

	productDescription: {
	},
};

if (typeof module !== 'undefined') {
	module.exports = product;
}

export default product;
export { code, abbreviation, description };
