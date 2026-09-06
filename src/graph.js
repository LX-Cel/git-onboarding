// Assign lanes from ancestry, rather than drawing a decorative, unrelated graph.
export function layoutGraph(commits) {
  const lanes = [];
  const nodes = commits.map((commit, row) => {
    let lane = lanes.indexOf(commit.hash);
    if (lane < 0) {
      lane = lanes.indexOf(null);
      if (lane < 0) lane = lanes.length;
    }
    lanes[lane] = null;
    commit.parents.forEach((parent, index) => {
      if (lanes.includes(parent)) return;
      let next =
        index === 0 && lanes[lane] === null ? lane : lanes.indexOf(null);
      if (next < 0) next = lanes.length;
      lanes[next] = parent;
    });
    return { ...commit, lane, row, x: 15 + lane * 18, y: 28 + row * 56 };
  });
  const byHash = new Map(nodes.map((node) => [node.hash, node]));
  const edges = nodes.flatMap((node) =>
    node.parents
      .map((hash) => ({ from: node, to: byHash.get(hash) }))
      .filter((edge) => edge.to),
  );
  return { nodes, edges, width: Math.max(40, ...nodes.map((n) => n.x + 18)) };
}
