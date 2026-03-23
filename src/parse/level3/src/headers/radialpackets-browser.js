import { parser } from '../packets/browser.js';

const parse = (raf, productDescription, layerCount, options) => {
    const firstRadialOnly = options?.parseFirstRadialPacketOnly === true;
    const layers = [];
    for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
        const startPos = raf.getPos();
        const layerDivider = raf.readShort();
        const layerLength = raf.readInt();
        if (layerDivider !== -1) throw new Error(`Invalid layer divider ${layerDivider} in layer ${layerIndex}`);
        if (layerLength + raf.getPos() > raf.getLength()) {
            throw new Error(`Layer size overruns block size for layer ${layerIndex}`);
        }

        try {
            const packets = [];
            const layerEnd = startPos + layerLength;
            while (raf.getPos() < layerEnd) {
                const parsedPacket = parser(raf, productDescription, options);
                if (firstRadialOnly && parsedPacket && Array.isArray(parsedPacket.radials)) {
                    raf.seek(layerEnd);
                    layers.push(parsedPacket);
                    return layers;
                }
                packets.push(parsedPacket);
            }
            if (packets.length === 1) {
                layers.push(packets[0]);
            } else {
                layers.push(packets);
            }
        } catch (error) {
            options.logger.warn(error.stack);
            raf.seek(startPos + layerLength);
            layers.push(undefined);
        }
    }
    return layers;
};

export default parse;
