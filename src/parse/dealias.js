/*
  HUGE credit to SteepAtticStairs's AtticRadar application for this one:
  https://atticradar.steepatticstairs.net

  This script was ported to SparkRadar from the region-based dealiasing
  algoritm found here: https://github.com/SteepAtticStairs/AtticRadar/blob/main/app%2Fradar%2Flibnexrad_helpers%2Flevel2%2Fdealias%2Fdealias.js
*/

const np = {
	linspace(startValue, stopValue, cardinality) {
		const arr = [];
		const step = (stopValue - startValue) / (cardinality - 1);
		for (let i = 0; i < cardinality; i++) {
			arr.push(startValue + (step * i));
		}
		return arr;
	},
	shape(arr) {
		const numRows = arr.length;
		const numCols = arr[0]?.length;
		return [numRows ?? 1, numCols ?? 1];
	},
	zeros(shape) {
		if (shape.length === 0) {
			return 0;
		}
		const arr = new Array(shape[0]);
		for (let i = 0; i < shape[0]; i++) {
			arr[i] = this.zeros(shape.slice(1));
		}
		return arr;
	},
	ones_like(arr) {
		return new Array(arr.length).fill(1);
	},
	bincount(arr) {
		if (!arr.length) return [];
		const counts = new Array(max(arr) + 1).fill(0);
		for (const x of arr) {
			counts[x] += 1;
		}
		return counts;
	},
	lexsort(arr1, arr2) {
		const indices = Array.from({ length: arr1.length }, (_, i) => i);
		indices.sort((a, b) => {
			const cmp = arr1[a] - arr1[b];
			if (cmp !== 0) {
				return cmp;
			}
			return arr2[a] - arr2[b];
		});
		return indices;
	},
	nonzero(arr) {
		return arr.reduce((acc, cur, i) => {
			if (cur) {
				acc.push(i);
			}
			return acc;
		}, []);
	},
	argmax(arr) {
		let maxIndex = 0;
		for (let i = 1; i < arr.length; i++) {
			if (arr[i] > arr[maxIndex]) {
				maxIndex = i;
			}
		}
		return maxIndex;
	},
	add: {
		reduceat(arr, indices) {
			const result = [];
			for (let i = 0; i < indices.length; i++) {
				const curIndex = indices[i];
				const nextIndex = indices[i + 1];
				if (Number.isFinite(nextIndex) && curIndex > nextIndex) {
					result.push(curIndex);
				} else {
					const sliced = arr.slice(curIndex, nextIndex);
					const added = sliced.reduce((a, b) => a + b, 0);
					result.push(added);
				}
			}
			return result;
		}
	}
};

function copy(arr) {
	return JSON.parse(JSON.stringify(arr));
}

function remove(arr, value) {
	const index = arr.indexOf(value);
	if (index !== -1) {
		arr.splice(index, 1);
	}
	return arr;
}

function min(arr) {
	let current = Infinity;
	for (let i = 0; i < arr.length; i++) {
		const value = arr[i];
		if (value < current) current = value;
	}
	return current;
}

function max(arr) {
	let current = -Infinity;
	for (let i = 0; i < arr.length; i++) {
		const value = arr[i];
		if (value > current) current = value;
	}
	return current;
}

function labelImage(arr) {
	const labels = new Array(arr.length).fill(0).map(() => new Array(arr[0].length).fill(0));
	let labelCount = 1;

	for (let i = 0; i < arr.length; i++) {
		for (let j = 0; j < arr[0].length; j++) {
			if (arr[i][j] && labels[i][j] === 0) {
				const queue = [[i, j]];
				while (queue.length > 0) {
					const [row, col] = queue.shift();
					labels[row][col] = labelCount;
					for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
						const x = row + dx;
						const y = col + dy;
						if (
							x >= 0
							&& x < arr.length
							&& y >= 0
							&& y < arr[0].length
							&& arr[x][y]
							&& labels[x][y] === 0
						) {
							queue.push([x, y]);
							labels[x][y] = -1;
						}
					}
				}
				labelCount += 1;
			}
		}
	}

	for (let i = 0; i < labels.length; i++) {
		for (let j = 0; j < labels[0].length; j++) {
			if (labels[i][j] === -1) {
				labels[i][j] = 0;
			}
		}
	}

	return [labels, labelCount - 1];
}

function maskValues(velocities) {
	for (let i = 0; i < velocities.length; i++) {
		for (let n = 0; n < velocities[i].length; n++) {
			if (velocities[i][n] == null || !Number.isFinite(velocities[i][n])) {
				velocities[i][n] = -64.5;
			}
		}
	}
	return velocities;
}

function findSweepIntervalSplits(nyquist, intervalSplits, velocities) {
	let addStart = 0;
	let addEnd = 0;
	const interval = (2 * nyquist) / intervalSplits;

	if (velocities.length !== 0) {
		let maxVel = -Infinity;
		let minVel = Infinity;
		for (let r = 0; r < velocities.length; r++) {
			const row = velocities[r];
			if (!Array.isArray(row)) continue;
			for (let c = 0; c < row.length; c++) {
				const value = row[c];
				if (!Number.isFinite(value)) continue;
				if (value > maxVel) maxVel = value;
				if (value < minVel) minVel = value;
			}
		}
		if (Number.isFinite(maxVel) && Number.isFinite(minVel)) {
			if (maxVel > nyquist || minVel < -nyquist) {
				addStart = Math.ceil((maxVel - nyquist) / interval);
				addEnd = Math.ceil(-(minVel + nyquist) / interval);
			}
		}
	}

	const start = -nyquist - addStart * interval;
	const end = nyquist + addEnd * interval;
	const num = intervalSplits + 1 + addStart + addEnd;
	return np.linspace(start, end, num);
}

function combineRegions(regionTracker, edgeTracker) {
	const [status, extra] = edgeTracker.popEdge();
	if (status) {
		return true;
	}
	let [node1, node2, _weight, diff, edgeNumber] = extra;
	let rdiff = Math.round(diff);

	const node1Size = regionTracker.getNodeSize(node1);
	const node2Size = regionTracker.getNodeSize(node2);

	let baseNode;
	let mergeNode;
	if (node1Size > node2Size) {
		[baseNode, mergeNode] = [node1, node2];
	} else {
		[baseNode, mergeNode] = [node2, node1];
		rdiff = -rdiff;
	}

	if (rdiff !== 0) {
		regionTracker.unwrapNode(mergeNode, rdiff);
		edgeTracker.unwrapNode(mergeNode, rdiff);
	}

	regionTracker.mergeNodes(baseNode, mergeNode);
	edgeTracker.mergeNodes(baseNode, mergeNode, edgeNumber);
	return false;
}

class EdgeTracker {
	constructor(indices, edgeCount, velocities, nyquistInterval, nnodes) {
		const nedges = Math.floor(indices[0].length / 2);

		this.nodeAlpha = new Array(nedges).fill(0);
		this.nodeBeta = new Array(nedges).fill(0);
		this.sumDiff = new Array(nedges).fill(0);
		this.weight = new Array(nedges).fill(0);

		this.commonFinder = new Array(nnodes).fill(false);
		this.commonIndex = new Array(nnodes).fill(0);
		this.lastBaseNode = -1;

		this.edgesInNode = new Array(nnodes).fill(0).map(() => []);

		let edge = 0;
		const [idx1, idx2] = indices;
		const [vel1, vel2] = velocities;

		for (let k = 0; k < idx1.length; k++) {
			const i = idx1[k];
			const j = idx2[k];
			const count = edgeCount[k];
			const vel = vel1[k];
			const nvel = vel2[k];

			if (i < j) {
				continue;
			}
			this.nodeAlpha[edge] = i;
			this.nodeBeta[edge] = j;
			this.sumDiff[edge] = ((vel - nvel) / nyquistInterval);
			this.weight[edge] = count;
			this.edgesInNode[i].push(edge);
			this.edgesInNode[j].push(edge);
			edge += 1;
		}
	}

	mergeNodes(baseNode, mergeNode, fooEdge) {
		this.weight[fooEdge] = -999;
		this.edgesInNode[mergeNode] = remove(this.edgesInNode[mergeNode], fooEdge);
		this.edgesInNode[baseNode] = remove(this.edgesInNode[baseNode], fooEdge);
		this.commonFinder[mergeNode] = false;

		const edgesInMerge = [...this.edgesInNode[mergeNode]];

		if (this.lastBaseNode !== baseNode) {
			this.commonFinder.fill(false);
			const edgesInBase = [...this.edgesInNode[baseNode]];
			for (let i = 0; i < edgesInBase.length; i++) {
				const edgeNum = edgesInBase[i];
				if (this.nodeBeta[edgeNum] === baseNode) {
					this.reverseEdgeDirection(edgeNum);
				}

				const neighbor = this.nodeBeta[edgeNum];
				this.commonFinder[neighbor] = true;
				this.commonIndex[neighbor] = edgeNum;
			}
		}

		for (let i = 0; i < edgesInMerge.length; i++) {
			const edgeNum = edgesInMerge[i];
			if (this.nodeBeta[edgeNum] === mergeNode) {
				this.reverseEdgeDirection(edgeNum);
			}

			this.nodeAlpha[edgeNum] = baseNode;
			const neighbor = this.nodeBeta[edgeNum];
			if (this.commonFinder[neighbor]) {
				const baseEdgeNum = this.commonIndex[neighbor];
				this.combineEdges(baseEdgeNum, edgeNum, mergeNode, neighbor);
			} else {
				this.commonFinder[neighbor] = true;
				this.commonIndex[neighbor] = edgeNum;
			}
		}

		const edges = this.edgesInNode[mergeNode];
		this.edgesInNode[baseNode].push(...edges);
		this.edgesInNode[mergeNode] = [];
		this.lastBaseNode = Number(baseNode);
	}

	combineEdges(baseEdge, mergeEdge, mergeNode, neighborNode) {
		this.weight[baseEdge] += this.weight[mergeEdge];
		this.weight[mergeEdge] = -999;
		this.sumDiff[baseEdge] += this.sumDiff[mergeEdge];

		this.edgesInNode[mergeNode] = remove(this.edgesInNode[mergeNode], mergeEdge);
		this.edgesInNode[neighborNode] = remove(this.edgesInNode[neighborNode], mergeEdge);
	}

	reverseEdgeDirection(edge) {
		const oldAlpha = Number(this.nodeAlpha[edge]);
		const oldBeta = Number(this.nodeBeta[edge]);
		this.nodeAlpha[edge] = oldBeta;
		this.nodeBeta[edge] = oldAlpha;
		this.sumDiff[edge] = -1 * this.sumDiff[edge];
	}

	unwrapNode(node, nwrap) {
		if (nwrap === 0) {
			return;
		}
		for (let i = 0; i < this.edgesInNode[node].length; i++) {
			const edge = this.edgesInNode[node][i];
			const weight = this.weight[edge];
			if (node === this.nodeAlpha[edge]) {
				this.sumDiff[edge] += weight * nwrap;
			} else {
				this.sumDiff[edge] += -weight * nwrap;
			}
		}
	}

	popEdge() {
		const edgeNum = np.argmax(this.weight);
		const node1 = this.nodeAlpha[edgeNum];
		const node2 = this.nodeBeta[edgeNum];
		const weight = this.weight[edgeNum];
		const diff = this.sumDiff[edgeNum] / Number(weight);

		if (weight < 0) {
			return [true, null];
		}
		return [false, [node1, node2, weight, diff, edgeNum]];
	}
}

class RegionTracker {
	constructor(regionSizes) {
		const nregions = regionSizes.length + 1;
		this.nodeSize = new Array(nregions).fill(0);
		this.nodeSize.splice(1, regionSizes.length, ...regionSizes);

		this.regionsInNode = new Array(nregions).fill(0).map((_, i) => [i]);
		this.unwrapNumber = new Array(nregions).fill(0);
	}

	mergeNodes(nodeA, nodeB) {
		const regionsToMerge = this.regionsInNode[nodeB];
		this.regionsInNode[nodeA].push(...regionsToMerge);
		this.regionsInNode[nodeB] = [];

		this.nodeSize[nodeA] += this.nodeSize[nodeB];
		this.nodeSize[nodeB] = 0;
	}

	unwrapNode(node, nwrap) {
		if (nwrap === 0) {
			return;
		}
		const regionsToUnwrap = this.regionsInNode[node];
		for (let i = 0; i < regionsToUnwrap.length; i++) {
			this.unwrapNumber[regionsToUnwrap[i]] += nwrap;
		}
	}

	getNodeSize(node) {
		return this.nodeSize[node];
	}
}

function edgeSumAndCount(labels, numMaskedGates, data, raysWrapAround, maxGapX, maxGapY, protectedMask = null) {
	const lShape = np.shape(labels);
	let totalNodes = lShape[0] * lShape[1] - numMaskedGates;
	if (raysWrapAround) {
		totalNodes += lShape[0] * 2;
	}

	let [indices, velocities] = fastEdgeFinder(labels, data, raysWrapAround, maxGapX, maxGapY, totalNodes, protectedMask);
	let [index1, index2] = indices;
	let [vel1, vel2] = velocities;
	let count = np.ones_like(vel1);

	if (vel1.length === 0) {
		return [[[], []], [], [[], []]];
	}

	const order = np.lexsort(index1, index2);
	index1 = order.map((i) => index1[i]);
	index2 = order.map((i) => index2[i]);
	vel1 = order.map((i) => vel1[i]);
	vel2 = order.map((i) => vel2[i]);
	count = order.map((i) => count[i]);

	const uniqueMask = new Array(index1.length - 1);
	for (let i = 0; i < uniqueMask.length; i++) {
		uniqueMask[i] = (index1[i + 1] !== index1[i]) || (index2[i + 1] !== index2[i]);
	}
	uniqueMask.unshift(true);

	index1 = index1.filter((_, i) => uniqueMask[i]);
	index2 = index2.filter((_, i) => uniqueMask[i]);

	const uniqueInds = np.nonzero(uniqueMask);
	vel1 = np.add.reduceat(vel1, uniqueInds);
	vel2 = np.add.reduceat(vel2, uniqueInds);
	count = np.add.reduceat(count, uniqueInds);

	return [[index1, index2], count, [vel1, vel2]];
}

function isProtectedGate(mask, rayIndex, gateIndex) {
	return Boolean(mask?.[rayIndex]?.[gateIndex]);
}

function fastEdgeFinder(labels, data, raysWrapAround, maxGapX, maxGapY, totalNodes, protectedMask = null) {
	const lShape = np.shape(labels);
	const collector = new EdgeCollector(totalNodes);
	const right = lShape[0] - 1;
	const bottom = lShape[1] - 1;

	for (let xIndex = 0; xIndex < lShape[0]; xIndex++) {
		for (let yIndex = 0; yIndex < lShape[1]; yIndex++) {
			const label = labels[xIndex][yIndex];
			if (label === 0) {
				continue;
			}
			if (isProtectedGate(protectedMask, xIndex, yIndex)) {
				continue;
			}

			const vel = data[xIndex][yIndex];

			let xCheck = xIndex - 1;
			if (xCheck === -1 && raysWrapAround) {
				xCheck = right;
			}
			if (xCheck !== -1) {
				let neighbor = labels[xCheck][yIndex];
				if (neighbor === 0) {
					for (let i = 0; i < maxGapX; i++) {
						xCheck -= 1;
						if (xCheck === -1) {
							if (raysWrapAround) {
								xCheck = right;
							} else {
								break;
							}
						}
						neighbor = labels[xCheck][yIndex];
						if (neighbor !== 0) {
							break;
						}
					}
				}
				const nvel = data[xCheck][yIndex];
				if (!isProtectedGate(protectedMask, xCheck, yIndex)) {
					collector.addEdge(label, neighbor, vel, nvel);
				}
			}

			xCheck = xIndex + 1;
			if (xCheck === right + 1 && raysWrapAround) {
				xCheck = 0;
			}
			if (xCheck !== right + 1) {
				let neighbor = labels[xCheck][yIndex];
				if (neighbor === 0) {
					for (let i = 0; i < maxGapX; i++) {
						xCheck += 1;
						if (xCheck === right + 1) {
							if (raysWrapAround) {
								xCheck = 0;
							} else {
								break;
							}
						}
						neighbor = labels[xCheck][yIndex];
						if (neighbor !== 0) {
							break;
						}
					}
				}
				const nvel = data[xCheck][yIndex];
				if (!isProtectedGate(protectedMask, xCheck, yIndex)) {
					collector.addEdge(label, neighbor, vel, nvel);
				}
			}

			let yCheck = yIndex - 1;
			if (yCheck !== -1) {
				let neighbor = labels[xIndex][yCheck];
				if (neighbor === 0) {
					for (let i = 0; i < maxGapY; i++) {
						yCheck -= 1;
						if (yCheck === -1) {
							break;
						}
						neighbor = labels[xIndex][yCheck];
						if (neighbor !== 0) {
							break;
						}
					}
				}
				const nvel = data[xIndex][yCheck];
				if (!isProtectedGate(protectedMask, xIndex, yCheck)) {
					collector.addEdge(label, neighbor, vel, nvel);
				}
			}

			yCheck = yIndex + 1;
			if (yCheck !== bottom + 1) {
				let neighbor = labels[xIndex][yCheck];
				if (neighbor === 0) {
					for (let i = 0; i < maxGapY; i++) {
						yCheck += 1;
						if (yCheck === bottom + 1) {
							break;
						}
						neighbor = labels[xIndex][yCheck];
						if (neighbor !== 0) {
							break;
						}
					}
				}
				const nvel = data[xIndex][yCheck];
				if (!isProtectedGate(protectedMask, xIndex, yCheck)) {
					collector.addEdge(label, neighbor, vel, nvel);
				}
			}
		}
	}

	return collector.getIndicesAndVelocities();
}

function dilateMask(mask, rayRadius = 1, gateRadius = 1) {
	const rows = mask.length;
	const cols = mask[0]?.length || 0;
	const expanded = mask.map((row) => row.slice());
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (!mask[r][c]) continue;
			for (let dr = -rayRadius; dr <= rayRadius; dr++) {
				const rr = r + dr;
				if (rr < 0 || rr >= rows) continue;
				for (let dc = -gateRadius; dc <= gateRadius; dc++) {
					const cc = c + dc;
					if (cc < 0 || cc >= cols) continue;
					expanded[rr][cc] = true;
				}
			}
		}
	}
	return expanded;
}

function buildRotationProtectionMask(velocities, nyquistVelocity, options = {}) {
	if (!Array.isArray(velocities) || velocities.length === 0 || !Number.isFinite(nyquistVelocity) || nyquistVelocity <= 0) {
		return null;
	}

	const rayCount = velocities.length;
	const gateCount = velocities[0]?.length || 0;
	if (gateCount === 0) {
		return null;
	}

	const signComponentThreshold = Number.isFinite(options.signComponentThreshold)
		? options.signComponentThreshold
		: Math.max(8, nyquistVelocity * 0.25);
	const radialPolarityShearThreshold = Number.isFinite(options.radialPolarityShearThreshold)
		? options.radialPolarityShearThreshold
		: Math.max(10, nyquistVelocity * 0.45);
	const rayRadius = Number.isFinite(options.rayRadius) ? options.rayRadius : 0;
	const gateRadius = Number.isFinite(options.gateRadius) ? options.gateRadius : 1;

	const mask = new Array(rayCount).fill(false).map(() => new Array(gateCount).fill(false));
	let protectedCount = 0;
	const mark = (r, c) => {
		if (!mask[r][c]) {
			mask[r][c] = true;
			protectedCount += 1;
		}
	};

	for (let r = 0; r < rayCount; r++) {
		for (let c = 0; c + 1 < gateCount; c++) {
			const v1 = velocities[r][c];
			const v2 = velocities[r][c + 1];
			if (!Number.isFinite(v1) || !Number.isFinite(v2)) continue;

			const polarityFlip = (v1 < 0 && v2 > 0) || (v1 > 0 && v2 < 0);
			if (!polarityFlip) continue;

			const shear = Math.abs(v2 - v1);
			if (
				shear >= radialPolarityShearThreshold
				&& Math.abs(v1) >= signComponentThreshold
				&& Math.abs(v2) >= signComponentThreshold
			) {
				mark(r, c);
				mark(r, c + 1);
			}
		}
	}

	if (protectedCount === 0) {
		return {
			mask,
			protectedCount: 0,
			dilatedProtectedCount: 0,
		};
	}

	const dilatedMask = dilateMask(mask, rayRadius, gateRadius);
	let dilatedProtectedCount = 0;
	for (let r = 0; r < rayCount; r++) {
		for (let c = 0; c < gateCount; c++) {
			if (dilatedMask[r][c]) {
				dilatedProtectedCount += 1;
			}
		}
	}

	return {
		mask: dilatedMask,
		protectedCount,
		dilatedProtectedCount,
	};
}

function collectLocalNeighborValues(rows, rayIndex, gateIndex) {
	const values = [];
	for (let dr = -1; dr <= 1; dr++) {
		for (let dg = -1; dg <= 1; dg++) {
			if (dr === 0 && dg === 0) continue;
			const rr = rayIndex + dr;
			const cc = gateIndex + dg;
			if (rr < 0 || rr >= rows.length || cc < 0 || cc >= (rows[rr]?.length || 0)) continue;
			const neighbor = rows[rr][cc];
			if (Number.isFinite(neighbor)) {
				values.push(neighbor);
			}
		}
	}
	return values;
}

function collectRadialNeighborValues(rows, rayIndex, gateIndex, window = 3) {
	const values = [];
	const row = rows[rayIndex] || [];
	for (let dg = -window; dg <= window; dg++) {
		if (dg === 0) continue;
		const cc = gateIndex + dg;
		if (cc < 0 || cc >= row.length) continue;
		const neighbor = row[cc];
		if (Number.isFinite(neighbor)) {
			values.push(neighbor);
		}
	}
	return values;
}

function scoreCandidateAgainstNeighbors(candidate, neighbors) {
	if (!neighbors.length) return Infinity;
	let score = 0;
	for (let i = 0; i < neighbors.length; i++) {
		score += Math.abs(candidate - neighbors[i]);
	}
	return score / neighbors.length;
}

function locallyUnwrapRotationGates(originalRows, correctedRows, nyquistVelocity, rotationMask, debugStats = null) {
	if (!rotationMask || !Array.isArray(rotationMask)) {
		return correctedRows;
	}

	const interval = 2 * nyquistVelocity;
	let locallyAdjustedGateCount = 0;
	const maxPasses = 2;
	const minDiscontinuityToConsider = Math.max(8, nyquistVelocity * 0.6);
	const minImprovementRequired = Math.max(2, nyquistVelocity * 0.15);

	for (let pass = 0; pass < maxPasses; pass++) {
		let passAdjusted = 0;
		for (let r = 0; r < correctedRows.length; r++) {
			for (let c = 0; c < (correctedRows[r]?.length || 0); c++) {
				if (!rotationMask[r]?.[c]) continue;
				const originalValue = originalRows[r]?.[c];
				const currentValue = correctedRows[r]?.[c];
				if (!Number.isFinite(originalValue) || !Number.isFinite(currentValue)) continue;

				const radialNeighbors = collectRadialNeighborValues(correctedRows, r, c, 3);
				const neighbors = radialNeighbors.length >= 2
					? radialNeighbors
					: collectLocalNeighborValues(correctedRows, r, c);
				if (neighbors.length < 2) continue;

				const baseWrap = Math.round((currentValue - originalValue) / interval);
				let bestValue = currentValue;
				let bestScore = scoreCandidateAgainstNeighbors(currentValue, neighbors);
				if (bestScore < minDiscontinuityToConsider) {
					continue;
				}

				for (let wrapOffset = -1; wrapOffset <= 1; wrapOffset++) {
					const candidateWrap = baseWrap + wrapOffset;
					const candidateValue = originalValue + candidateWrap * interval;
					const score = scoreCandidateAgainstNeighbors(candidateValue, neighbors);
					if (score < bestScore - minImprovementRequired) {
						bestScore = score;
						bestValue = candidateValue;
					}
				}

				if (bestValue !== currentValue) {
					correctedRows[r][c] = bestValue;
					passAdjusted += 1;
				}
			}
		}
		locallyAdjustedGateCount += passAdjusted;
		if (passAdjusted === 0) break;
	}

	if (debugStats) {
		debugStats.rotationLocalAdjustedGateCount = locallyAdjustedGateCount;
	}

	return correctedRows;
}

class EdgeCollector {
	constructor(totalNodes) {
		this.lIndex = new Array(totalNodes * 4);
		this.nIndex = new Array(totalNodes * 4);
		this.lVelo = new Array(totalNodes * 4);
		this.nVelo = new Array(totalNodes * 4);
		this.idx = 0;
	}

	addEdge(label, neighbor, vel, nvel) {
		if (neighbor === label || neighbor === 0) {
			return 0;
		}
		this.lIndex[this.idx] = label;
		this.nIndex[this.idx] = neighbor;
		this.lVelo[this.idx] = vel;
		this.nVelo[this.idx] = nvel;
		this.idx += 1;
		return 1;
	}

	getIndicesAndVelocities() {
		const indices = [this.lIndex.slice(0, this.idx), this.nIndex.slice(0, this.idx)];
		const velocities = [this.lVelo.slice(0, this.idx), this.nVelo.slice(0, this.idx)];
		return [indices, velocities];
	}
}

function findRegions(vel, limits) {
	const label = np.zeros(np.shape(vel));
	let nfeatures = 0;

	for (let i = 0; i < limits.length - 1; i++) {
		const lmin = limits[i];
		const lmax = limits[i + 1];

		const rows = vel.length;
		const cols = vel[0].length;
		const inp = new Array(rows);
		for (let r = 0; r < rows; r++) {
			inp[r] = new Array(cols);
			for (let c = 0; c < cols; c++) {
				inp[r][c] = (lmin <= vel[r][c]) && (vel[r][c] < lmax);
			}
		}

		const [limitLabel, limitNfeatures] = labelImage(inp);

		const llshape = np.shape(limitLabel);
		for (let r = 0; r < llshape[0]; r++) {
			for (let c = 0; c < llshape[1]; c++) {
				if (limitLabel[r][c] !== 0) {
					limitLabel[r][c] += nfeatures;
				}
			}
		}

		for (let r = 0; r < label.length; r++) {
			for (let c = 0; c < label[r].length; c++) {
				label[r][c] += limitLabel[r][c];
			}
		}

		nfeatures += limitNfeatures;
	}

	return [label, nfeatures];
}

export function dealias2D(velocities, nyquistVelocity, options = {}) {
	if (!Array.isArray(velocities) || velocities.length === 0 || !Number.isFinite(nyquistVelocity) || nyquistVelocity <= 0) {
		return velocities;
	}

	const intervalSplits = 3;
	const skipBetweenRays = 99;
	const skipAlongRay = 100;
	const centered = true;
	const raysWrapAround = true;
	const protectedMask = options.protectedMask || null;

	let sdata = copy(velocities);
	sdata = maskValues(sdata);
	const scorr = copy(velocities);

	const nyquistInterval = 2 * nyquistVelocity;
	const intervalLimits = findSweepIntervalSplits(nyquistVelocity, intervalSplits, sdata);
	const [labels, nfeatures] = findRegions(sdata, intervalLimits);

	if (nfeatures < 2) {
		return scorr;
	}

	const bincount = np.bincount(labels.flat());
	const numMaskedGates = bincount[0] || 0;
	const regionSizes = bincount.slice(1);

	const [indices, edgeCount, velos] = edgeSumAndCount(
		labels,
		numMaskedGates,
		sdata,
		raysWrapAround,
		skipBetweenRays,
		skipAlongRay,
		protectedMask
	);

	if (edgeCount.length === 0) {
		return scorr;
	}

	const regionTracker = new RegionTracker(regionSizes);
	const edgeTracker = new EdgeTracker(indices, edgeCount, velos, nyquistInterval, nfeatures + 1);
	while (true) {
		if (combineRegions(regionTracker, edgeTracker)) {
			break;
		}
	}

	if (centered) {
		const gatesDealiased = regionSizes.reduce((a, b) => a + b, 0);
		let totalFolds = 0;
		for (let i = 0; i < regionSizes.length; i++) {
			totalFolds += regionSizes[i] * regionTracker.unwrapNumber[i + 1];
		}
		const sweepOffset = Math.round(totalFolds / gatesDealiased);
		if (sweepOffset !== 0) {
			for (let i = 0; i < regionTracker.unwrapNumber.length; i++) {
				regionTracker.unwrapNumber[i] -= sweepOffset;
			}
		}
	}

	for (let i = 1; i < nfeatures + 1; i++) {
		const nwrap = regionTracker.unwrapNumber[i];
		if (nwrap !== 0) {
			for (let r = 0; r < labels.length; r++) {
				for (let c = 0; c < labels[0].length; c++) {
					if (labels[r][c] === i) {
						scorr[r][c] += nwrap * nyquistInterval;
					}
				}
			}
		}
	}

	return scorr;
}

const inferNyquistFromData = (rows) => {
	let maxAbs = 0;
	let foundFinite = false;
	for (let r = 0; r < rows.length; r++) {
		const row = rows[r];
		if (!Array.isArray(row)) continue;
		for (let c = 0; c < row.length; c++) {
			const value = row[c];
			if (!Number.isFinite(value)) continue;
			foundFinite = true;
			const abs = Math.abs(value);
			if (abs > maxAbs) maxAbs = abs;
		}
	}
	if (!foundFinite) return null;
	if (!Number.isFinite(maxAbs) || maxAbs <= 0) return null;
	return maxAbs;
};

const inferNyquistFromHeaders = (headers) => {
	if (!Array.isArray(headers)) return null;
	const normalizeNyquist = (value) => {
		if (!Number.isFinite(value) || value <= 0) return null;
		// Guard against unscaled raw shorts from some parser paths.
		return value > 300 ? value / 100 : value;
	};
	const values = headers
		.map((header) => normalizeNyquist(Number(header?.radial?.nyquist_velocity)))
		.filter((value) => Number.isFinite(value) && value > 0);
	if (!values.length) return null;
	values.sort((a, b) => a - b);
	return values[Math.floor(values.length / 2)];
};

export function dealiasVelocityRadials(radials, options = {}) {
	if (!Array.isArray(radials) || radials.length === 0) {
		return radials;
	}

	let maxGateCount = 0;
	for (let i = 0; i < radials.length; i++) {
		const gateCount = Number(radials[i]?.gate_count || 0);
		if (gateCount > maxGateCount) {
			maxGateCount = gateCount;
		}
	}
	if (maxGateCount <= 0) {
		return radials;
	}

	const rows = new Array(radials.length);
	for (let r = 0; r < radials.length; r++) {
		rows[r] = new Array(maxGateCount).fill(null);
		const radial = radials[r];
		if (!radial || !Array.isArray(radial.moment_data)) {
			continue;
		}
		const gateCount = Math.min(Number(radial.gate_count || 0), radial.moment_data.length, maxGateCount);
		for (let g = 0; g < gateCount; g++) {
			const value = radial.moment_data[g];
			rows[r][g] = Number.isFinite(value) ? value : null;
		}
	}

	const nyquistVelocity = Number(options?.nyquistVelocity);
	const headerNyquist = inferNyquistFromHeaders(options?.headers);
	const inferredNyquist = inferNyquistFromData(rows);
	const nyquist = Number.isFinite(nyquistVelocity) && nyquistVelocity > 0
		? nyquistVelocity
		: (headerNyquist || inferredNyquist);

	if (!Number.isFinite(nyquist) || nyquist <= 0) {
		return radials;
	}

	const rotationProtection = buildRotationProtectionMask(rows, nyquist, options?.rotationProtection);
	if (options?.debugStats) {
		options.debugStats.rotationProtectedGateCount = rotationProtection?.protectedCount || 0;
		options.debugStats.rotationProtectedExpandedGateCount = rotationProtection?.dilatedProtectedCount || 0;
	}

	const corrected = dealias2D(rows, nyquist);
	locallyUnwrapRotationGates(rows, corrected, nyquist, rotationProtection?.mask || null, options?.debugStats || null);

	if (options?.debugMaskToRf === true && rotationProtection?.mask) {
		let forcedMaskGateCount = 0;
		for (let r = 0; r < corrected.length; r++) {
			for (let g = 0; g < (corrected[r]?.length || 0); g++) {
				if (!rotationProtection.mask[r]?.[g]) {
					continue;
				}
				if (!Number.isFinite(rows[r]?.[g])) {
					continue;
				}
				corrected[r][g] = -100;
				forcedMaskGateCount += 1;
			}
		}
		if (options?.debugStats) {
			options.debugStats.rotationMaskForcedRfGateCount = forcedMaskGateCount;
		}
	}

	for (let r = 0; r < radials.length; r++) {
		const radial = radials[r];
		if (!radial || !Array.isArray(radial.moment_data)) {
			continue;
		}
		const gateCount = Math.min(Number(radial.gate_count || 0), radial.moment_data.length, corrected[r]?.length || 0);
		for (let g = 0; g < gateCount; g++) {
			const originalValue = radial.moment_data[g];
			const correctedValue = corrected[r][g];
			if (Number.isFinite(originalValue) && Number.isFinite(correctedValue)) {
				radial.moment_data[g] = correctedValue;
			}
		}
	}

	return radials;
}

export default dealiasVelocityRadials;
