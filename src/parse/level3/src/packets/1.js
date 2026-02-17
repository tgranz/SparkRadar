const code = 1;
const description = 'Text and Special Symbol Packets';

const parser = (raf) => {
	// packet header
	const packetCode = raf.readUShort();
	const lengthOfBlock = raf.readShort();

	// test packet code
	if (packetCode !== code) throw new Error(`Packet codes do not match ${code} !== ${packetCode}`);

	// parse the data
	const result = {
		iStartingPoint: raf.readShort(),
		jStartingPoint: raf.readShort(),
	};
	// also providethe packet code in hex
	result.packetCodeHex = packetCode.toString(16);

	// read the result length
	result.text = raf.readString(lengthOfBlock - 4);

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
export { code, description, parser };
