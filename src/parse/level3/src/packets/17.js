const code = 23;
const description = 'Special Graphic Symbol Packet';

let packetParserRef = null;

const setPacketParser = (parserFn) => {
	packetParserRef = parserFn;
};

const parser = (raf) => {
	const packetParser = packetParserRef
		?? (typeof require !== 'undefined' ? require('.').parser : null);
	if (!packetParser) {
		throw new Error('Packet parser is unavailable for packet 17.');
	}
	// packet header
	const packetCode = raf.readUShort();
	const lengthOfBlock = raf.readShort();

	// parse the data as a series of packets
	const endPos = raf.getPos() + lengthOfBlock;
	const result = {
		packets: [],
	};
	while (raf.getPos() < endPos) {
		result.packets.push(packetParser(raf));
	}

	// also provide the packet code in hex
	result.packetCodeHex = packetCode.toString(16);

	return result;
};

const packet = {
	code,
	description,
	parser,
};

if (typeof module !== 'undefined') {
	module.exports = packet;
}

export default packet;
export { code, description, parser, setPacketParser };
