const code = 61;
const abbreviation = ['NTV'];
const description = 'Tornadic Vortex Signature';
import formatter from './formatter.js';

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
