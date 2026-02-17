import * as packet1Module from './1.js';
import * as packet2Module from './2.js';
import * as packet6Module from './6.js';
import * as packet8Module from './8.js';
import * as packet10Module from './10.js';
import * as packet13Module from './13.js';
import * as packet14Module from './14.js';
import * as packet15Module from './15.js';
import * as packet16Module from './16.js';
// packet 17/18 are defined inline to avoid circular requires in the browser bundle.
import * as packet19Module from './19.js';
import * as packet32Module from './32.js';
import * as packetAModule from './a.js';
import * as packetCModule from './c.js';
import * as packetFModule from './f.js';
import * as packetAf1fModule from './af1f.js';
import { setPacketParser } from './17.js';

const toPacket = (mod) => mod?.default ?? mod;

const packetsRaw = [
    toPacket(packet1Module),
    toPacket(packet2Module),
    toPacket(packet6Module),
    toPacket(packet8Module),
    toPacket(packet10Module),
    toPacket(packet13Module),
    toPacket(packet14Module),
    toPacket(packet15Module),
    toPacket(packet16Module),
    toPacket(packet19Module),
    toPacket(packet32Module),
    toPacket(packetAModule),
    toPacket(packetCModule),
    toPacket(packetFModule),
    toPacket(packetAf1fModule)
];

const packet17Parser = (raf) => {
    const packetCode = raf.readUShort();
    const lengthOfBlock = raf.readShort();
    const endPos = raf.getPos() + lengthOfBlock;
    const result = {
        packets: [],
    };
    while (raf.getPos() < endPos) {
        result.packets.push(parser(raf));
    }
    result.packetCodeHex = packetCode.toString(16);
    return result;
};

const packet17 = {
    code: 23,
    description: 'Special Graphic Symbol Packet',
    parser: packet17Parser,
};

const packet18 = {
    code: 24,
    description: 'Special Graphic Symbol Packet',
    parser: packet17Parser,
};

const packets = {};
packetsRaw.forEach((packet) => {
    if (!packet || packet.code === undefined) return;
    if (packets[packet.code]) {
        throw new Error(`Duplicate packet code ${packet.code}`);
    }
    packets[packet.code] = packet;
});

packets[packet17.code] = packet17;
packets[packet18.code] = packet18;

const parser = (raf, productDescription) => {
    const packetCode = raf.readUShort();
    raf.skip(-2);

    const packetCodeHex = packetCode.toString(16).padStart(4, '0');
    const packet = packets[packetCode];
    if (!packet) throw new Error(`Unsupported packet code 0x${packetCodeHex}`);
    return packet.parser(raf, productDescription);
};

setPacketParser(parser);

export { packets, parser };
