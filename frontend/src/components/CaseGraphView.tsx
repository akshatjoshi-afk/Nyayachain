import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import axios from 'axios';
import { User, Building, MapPin, Shield, Calendar, Search } from 'lucide-react';

interface CaseGraphViewProps {
  caseId: string;
  highlightEntityId?: string | null;
}

const getEntityStyle = (type: string) => {
  switch (type?.toUpperCase()) {
    case 'PERSON':
      return {
        bg: 'bg-blue-50 border-blue-500 text-blue-900',
        badge: 'bg-blue-100 text-blue-700',
        icon: User,
      };
    case 'ORG':
      return {
        bg: 'bg-purple-50 border-purple-500 text-purple-900',
        badge: 'bg-purple-100 text-purple-700',
        icon: Building,
      };
    case 'LOCATION':
      return {
        bg: 'bg-emerald-50 border-emerald-500 text-emerald-900',
        badge: 'bg-emerald-100 text-emerald-700',
        icon: MapPin,
      };
    case 'EVIDENCE':
      return {
        bg: 'bg-amber-50 border-amber-500 text-amber-900',
        badge: 'bg-amber-100 text-amber-700',
        icon: Shield,
      };
    case 'EVENT':
      return {
        bg: 'bg-rose-50 border-rose-500 text-rose-900',
        badge: 'bg-rose-100 text-rose-700',
        icon: Calendar,
      };
    default:
      return {
        bg: 'bg-slate-50 border-slate-400 text-slate-900',
        badge: 'bg-slate-100 text-slate-700',
        icon: Shield,
      };
  }
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 180, height: 70 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 90,
        y: nodeWithPosition.y - 35,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export default function CaseGraphView({ caseId, highlightEntityId }: CaseGraphViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(highlightEntityId || null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (highlightEntityId) {
      setSelectedNodeId(highlightEntityId);
    }
  }, [highlightEntityId]);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<{ nodes: any[]; edges: any[] }>(`/api/cases/${caseId}/graph`);
      const rawNodes = res.data.nodes || [];
      const rawEdges = res.data.edges || [];

      const formattedNodes: Node[] = rawNodes.map((n) => {
        const style = getEntityStyle(n.data?.type);
        const IconComponent = style.icon;

        return {
          id: String(n.id),
          position: n.position || { x: 0, y: 0 },
          data: {
            label: (
              <div className="flex items-center gap-2 p-1">
                <IconComponent className="w-4 h-4 flex-shrink-0" />
                <div className="min-w-0 text-left">
                  <div className="text-xs font-bold truncate">{n.data?.label}</div>
                  <div className="text-[10px] opacity-75 font-semibold">{n.data?.type}</div>
                </div>
              </div>
            ),
            rawLabel: n.data?.label,
            type: n.data?.type,
            date: n.data?.date,
          },
          className: `rounded-xl border-2 px-3 py-2 shadow-md transition-all ${style.bg}`,
        };
      });

      const formattedEdges: Edge[] = rawEdges.map((e) => ({
        id: String(e.id),
        source: String(e.source),
        target: String(e.target),
        label: e.label,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { strokeWidth: 2, stroke: '#94a3b8' },
        labelStyle: { fill: '#334155', fontWeight: 600, fontSize: 10 },
        labelBgStyle: { fill: '#f8fafc', rx: 4, ry: 4 },
        data: { sourceDocument: e.sourceDocument },
      }));

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        formattedNodes,
        formattedEdges,
      );

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load case relationship graph.');
    } finally {
      setLoading(false);
    }
  }, [caseId, setNodes, setEdges]);

  useEffect(() => {
    if (caseId) fetchGraph();
  }, [caseId, fetchGraph]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const selectedNodeInfo = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node) return null;

    const connectedEdges = edges.filter(
      (e) => e.source === selectedNodeId || e.target === selectedNodeId,
    );

    return {
      id: node.id,
      name: node.data?.rawLabel,
      type: node.data?.type,
      date: node.data?.date,
      connectedEdges,
    };
  }, [selectedNodeId, nodes, edges]);

  // Dynamic node styling for highlight/search
  const processedNodes = useMemo(() => {
    return nodes.map((node) => {
      const isSelected = selectedNodeId === node.id;
      const isMatchSearch =
        searchTerm.trim() !== '' &&
        String(node.data?.rawLabel || '').toLowerCase().includes(searchTerm.toLowerCase());

      let borderExtra = '';
      if (isSelected) {
        borderExtra = ' ring-4 ring-blue-500 scale-105 z-20';
      } else if (isMatchSearch) {
        borderExtra = ' ring-4 ring-amber-400 scale-105 z-20';
      }

      return {
        ...node,
        className: `${node.className} ${borderExtra}`,
      };
    });
  }, [nodes, selectedNodeId, searchTerm]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium">Extracting and rendering entity relationship graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-sm">
        {error}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
        <Shield className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <h3 className="text-base font-bold text-gray-900 mb-1">No Graph Entities Found</h3>
        <p className="text-xs text-gray-500 max-w-md mx-auto">
          Upload documents with case evidence, persons, locations, or events to automatically extract and visualize the entity relationship graph.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[650px] relative">
      {/* Top Controls Toolbar */}
      <div className="p-3 bg-slate-900 text-white flex items-center justify-between gap-4 border-b border-slate-800 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
            Case Relationship Graph
          </span>
          <span className="bg-slate-800 text-slate-300 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            {nodes.length} Nodes • {edges.length} Edges
          </span>
        </div>

        {/* Search Input */}
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search entity..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* ReactFlow Workspace */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={processedNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
        >
          <Background color="#cbd5e1" gap={16} />
          <Controls />
          <MiniMap nodeStrokeWidth={3} />
        </ReactFlow>

        {/* Legend Panel */}
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg border border-gray-200 shadow-md z-10 space-y-1.5 text-xs font-medium">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
            Entity Types
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-gray-700">PERSON</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            <span className="text-gray-700">ORG</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-gray-700">LOCATION</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-gray-700">EVIDENCE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span className="text-gray-700">EVENT</span>
          </div>
        </div>

        {/* Selected Entity Side Info Drawer */}
        {selectedNodeInfo && (
          <div className="absolute top-4 right-4 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-10 text-xs">
            <div className="flex justify-between items-start mb-2">
              <span className="px-2 py-0.5 rounded font-bold uppercase text-[10px] bg-blue-100 text-blue-800">
                {selectedNodeInfo.type}
              </span>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>
            <h4 className="text-sm font-bold text-gray-900 mb-1">{selectedNodeInfo.name}</h4>
            {selectedNodeInfo.date && (
              <p className="text-gray-500 text-[11px] mb-2">
                Date: {new Date(selectedNodeInfo.date).toLocaleString()}
              </p>
            )}

            <div className="border-t border-gray-100 pt-2 mt-2">
              <div className="font-semibold text-gray-700 mb-1.5">
                Connected Relationships ({selectedNodeInfo.connectedEdges.length}):
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {selectedNodeInfo.connectedEdges.map((edge) => (
                  <div key={edge.id} className="bg-gray-50 border border-gray-200 rounded p-2 text-[11px]">
                    <div className="font-medium text-slate-800">{edge.label}</div>
                    {edge.data?.sourceDocument && (
                      <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                        Source: {edge.data.sourceDocument}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
