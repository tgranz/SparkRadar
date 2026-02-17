import { parser } from './17.js';

const code = 25;
const description = 'Special Graphic Symbol Packet';

// uses the same parser as 23 (0x17)

const packet = {
	code,
	description,
	parser,
};

if (typeof module !== 'undefined') {
	module.exports = packet;
}

export default packet;
export { code, description, parser };
