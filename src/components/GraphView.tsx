import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import {
  Network,
  Filter,
  Calendar,
  Layers,
  Sparkles,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sliders,
  HelpCircle,
  TrendingUp,
  Lock,
  Shield,
} from 'lucide-react';
import { Note, RelationType, GraphNode, GraphLink } from '../types';

interface GraphViewProps {
  notes: Note[];
  onSelectNote: (noteId: string) => void;
}

const RELATION_COLORS: Record<RelationType, { stroke: string; label: string; bg: string }> = {
  CAUSATION: { stroke: '#10b981', label: '인과 (Cause)', bg: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  CONTRAST: { stroke: '#f59e0b', label: '대조 (Contrast)', bg: 'bg-amber-950 text-amber-300 border-amber-800' },
  EXTENSION: { stroke: '#38bdf8', label: '확장 (Extension)', bg: 'bg-sky-950 text-sky-300 border-sky-800' },
  CONTRADICTION: { stroke: '#f43f5e', label: '모순 (Conflict)', bg: 'bg-rose-950 text-rose-300 border-rose-800' },
  PREREQUISITE: { stroke: '#a855f7', label: '선행조건 (Prereq)', bg: 'bg-purple-950 text-purple-300 border-purple-800' },
};

export const GraphView: React.FC<GraphViewProps> = ({ notes, onSelectNote }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [selectedNode, setSelectedNode] = useState<Note | null>(null);
  const [selectedRelationTypes, setSelectedRelationTypes] = useState<Record<RelationType, boolean>>({
    CAUSATION: true,
    CONTRAST: true,
    EXTENSION: true,
    CONTRADICTION: true,
    PREREQUISITE: true,
  });

  // Timeline slider
  const dates = useMemo(() => {
    const dList = notes.map((n) => n.date || '2026-01-01').sort();
    return Array.from(new Set(dList));
  }, [notes]);

  const [timelineIndex, setTimelineIndex] = useState<number>(dates.length - 1);

  // Sync timeline index when notes change
  useEffect(() => {
    if (dates.length > 0) {
      setTimelineIndex(dates.length - 1);
    }
  }, [dates.length]);

  const maxDate = dates[timelineIndex] || '9999-12-31';

  // Filtered notes based on timeline
  const visibleNotes = useMemo(() => {
    return notes.filter((n) => (n.date || '2026-01-01') <= maxDate);
  }, [notes, maxDate]);

  // Build nodes & links
  const { graphNodes, graphLinks } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();

    visibleNotes.forEach((n) => {
      nodeMap.set(n.id, {
        id: n.id,
        title: n.title,
        date: n.date,
        entitiesCount: n.entities?.length || 0,
        claimsCount: n.claims?.length || 0,
        openQuestionsCount: n.openQuestions?.length || 0,
      });
    });

    const links: GraphLink[] = [];

    visibleNotes.forEach((note) => {
      // Collect approved relations
      (note.approvedRelations || []).forEach((rel) => {
        if (
          nodeMap.has(rel.sourceNoteId) &&
          nodeMap.has(rel.targetNoteId) &&
          selectedRelationTypes[rel.relationType]
        ) {
          links.push({
            source: rel.sourceNoteId,
            target: rel.targetNoteId,
            relationType: rel.relationType,
            explanation: rel.explanation,
          });
        }
      });
    });

    return {
      graphNodes: Array.from(nodeMap.values()),
      graphLinks: links,
    };
  }, [visibleNotes, selectedRelationTypes]);

  // D3 Force Directed Graph Simulation
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Arrow markers for typed relationships
    const defs = svg.append('defs');
    Object.entries(RELATION_COLORS).forEach(([type, info]) => {
      defs
        .append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 22)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', info.stroke);
    });

    // Zoom container
    const g = svg.append('g');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Initial center transform
    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(0.9)
    );

    // Simulation
    const simulation = d3
      .forceSimulation<GraphNode>(graphNodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, any>(graphLinks)
          .id((d: any) => d.id)
          .distance(120)
      )
      .force('charge', d3.forceManyBody().strength(-380))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide().radius(45));

    // Render Links
    const linkGroup = g
      .append('g')
      .attr('class', 'links')
      .selectAll('g')
      .data(graphLinks)
      .enter()
      .append('g');

    const linkPaths = linkGroup
      .append('line')
      .attr('stroke', (d) => RELATION_COLORS[d.relationType]?.stroke || '#78716c')
      .attr('stroke-width', (d) => (d.relationType === 'CONTRADICTION' ? 2.5 : 1.8))
      .attr('stroke-dasharray', (d) =>
        d.relationType === 'CONTRAST' ? '4 3' : d.relationType === 'CONTRADICTION' ? '6 2' : 'none'
      )
      .attr('marker-end', (d) => `url(#arrow-${d.relationType})`)
      .attr('opacity', 0.85);

    // Edge text labels
    const linkLabels = linkGroup
      .append('text')
      .text((d) => RELATION_COLORS[d.relationType]?.label.split(' ')[0] || '')
      .attr('font-size', '9px')
      .attr('font-family', 'ui-monospace, monospace')
      .attr('fill', (d) => RELATION_COLORS[d.relationType]?.stroke || '#a8a29e')
      .attr('text-anchor', 'middle')
      .attr('dy', -3);

    // Render Nodes
    const node = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(graphNodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<any, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Outer circle
    node
      .append('circle')
      .attr('r', (d) => 12 + Math.min(d.claimsCount * 2, 8))
      .attr('fill', '#1c1917')
      .attr('stroke', (d) => {
        if (selectedNode?.id === d.id) return '#f59e0b';
        return '#44403c';
      })
      .attr('stroke-width', (d) => (selectedNode?.id === d.id ? 3 : 1.5))
      .attr('class', 'transition-all');

    // Inner indicator
    node
      .append('circle')
      .attr('r', 4)
      .attr('fill', (d) => (d.openQuestionsCount > 0 ? '#f43f5e' : '#f59e0b'));

    // Node labels
    node
      .append('text')
      .text((d) => (d.title.length > 14 ? d.title.slice(0, 13) + '…' : d.title))
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('fill', '#e7e5e4')
      .attr('text-anchor', 'middle')
      .attr('dy', 26);

    // Node click handler
    node.on('click', (event, d) => {
      event.stopPropagation();
      const found = notes.find((n) => n.id === d.id);
      if (found) setSelectedNode(found);
    });

    // Background click to deselect
    svg.on('click', () => {
      setSelectedNode(null);
    });

    // Simulation tick
    simulation.on('tick', () => {
      linkPaths
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      linkLabels
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graphNodes, graphLinks, selectedNode?.id]);

  const toggleRelationType = (type: RelationType) => {
    setSelectedRelationTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-950 text-stone-100 overflow-hidden relative">
      {/* Top Controls Toolbar */}
      <div className="h-14 border-b border-stone-800 px-6 flex items-center justify-between bg-stone-900/40 z-10 backdrop-blur-xs">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-stone-200 text-xs font-medium">
            <Network className="w-4 h-4 text-amber-400" />
            <span>의미적 지식 그래프</span>
          </div>

          <div className="h-4 w-px bg-stone-800" />

          {/* Relation filter toggles */}
          <div className="flex items-center space-x-1 text-xs">
            {(Object.keys(RELATION_COLORS) as RelationType[]).map((type) => {
              const info = RELATION_COLORS[type];
              const isChecked = selectedRelationTypes[type];
              return (
                <button
                  key={type}
                  onClick={() => toggleRelationType(type)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
                    isChecked
                      ? info.bg
                      : 'bg-stone-900/60 text-stone-500 border-stone-800 opacity-60'
                  }`}
                >
                  {info.label.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Why better than Obsidian badge */}
        <div className="hidden lg:flex items-center space-x-2 text-[11px] text-stone-400 bg-stone-950/80 px-3 py-1 rounded-full border border-stone-800">
          <span className="text-amber-400 font-semibold">✦ Obsidian 대비 차별점:</span>
          <span>단순 위키링크 실선이 아니라 인과·대조·모순 관계 엣지와 시간 흐름을 시각화합니다.</span>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div ref={containerRef} className="flex-1 relative w-full h-full">
        <svg ref={svgRef} className="w-full h-full" />

        {/* Floating Timeline Slider (Bottom Center) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-stone-900/90 border border-stone-800 p-3 rounded-xl shadow-2xl backdrop-blur-md flex flex-col space-y-1.5 w-80 sm:w-96 z-10">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center space-x-1 text-stone-400 font-medium">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>지식 진화 타임라인</span>
            </span>
            <span className="font-mono text-amber-400 text-xs font-semibold">
              ≤ {maxDate}
            </span>
          </div>
          <input
            id="slider-timeline"
            type="range"
            min={0}
            max={Math.max(0, dates.length - 1)}
            value={timelineIndex}
            onChange={(e) => setTimelineIndex(parseInt(e.target.value, 10))}
            className="w-full accent-amber-500 cursor-pointer h-1.5 bg-stone-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-stone-500 font-mono">
            <span>{dates[0] || '과거'}</span>
            <span>현재까지 ({visibleNotes.length}개 노드 표시)</span>
          </div>
        </div>

        {/* Selected Node Inspector Drawer (Right Side) */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-80 sm:w-96 bg-stone-900/95 border border-stone-800 rounded-xl p-4 shadow-2xl backdrop-blur-md z-20 space-y-3 animate-fade-in text-stone-200">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-stone-800 text-amber-400 border border-stone-700">
                    {selectedNode.intent || '개념 정의'}
                  </span>
                  {selectedNode.isLocked && (
                    <span className="flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {selectedNode.lockType === 'pin' ? <Lock className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                      <span>{selectedNode.lockType === 'pin' ? 'PIN 잠김' : '보호됨'}</span>
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-white mt-1 leading-snug flex items-center space-x-1.5">
                  <span>{selectedNode.title}</span>
                </h4>
                <p className="text-[11px] text-stone-400 flex items-center space-x-1 mt-0.5">
                  <Calendar className="w-3 h-3" />
                  <span>{selectedNode.date}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-stone-400 hover:text-white text-xs p-1"
              >
                닫기
              </button>
            </div>

            {selectedNode.isLocked && selectedNode.lockType === 'pin' ? (
              <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-lg text-center space-y-2">
                <Lock className="w-6 h-6 text-amber-400 mx-auto" />
                <p className="text-xs text-amber-200/90 font-medium">비밀번호로 보호된 노트</p>
                <p className="text-[11px] text-stone-400">보안을 위해 요약 및 세부 주장이 숨겨져 있습니다.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-stone-300 leading-relaxed line-clamp-3 bg-stone-950/60 p-2.5 rounded-lg border border-stone-800">
                  {selectedNode.summary || selectedNode.content.slice(0, 120)}
                </p>

                {/* Claims */}
                {selectedNode.claims && selectedNode.claims.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wider flex items-center space-x-1">
                      <TrendingUp className="w-3 h-3 text-amber-400" />
                      <span>추출된 핵심 주장 ({selectedNode.claims.length})</span>
                    </span>
                    <ul className="space-y-1 text-xs text-stone-300 list-disc list-inside">
                      {selectedNode.claims.map((claim, idx) => (
                        <li key={idx} className="leading-snug">
                          {claim}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Open questions */}
                {selectedNode.openQuestions && selectedNode.openQuestions.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-stone-400 uppercase tracking-wider flex items-center space-x-1">
                      <HelpCircle className="w-3 h-3 text-rose-400" />
                      <span>미해결 질문</span>
                    </span>
                    <ul className="space-y-1 text-xs text-rose-200/90">
                      {selectedNode.openQuestions.map((q, idx) => (
                        <li key={idx} className="p-1.5 rounded bg-rose-950/30 border border-rose-900/40">
                          ? {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <button
              onClick={() => onSelectNote(selectedNode.id)}
              className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-sm"
            >
              <span>{selectedNode.isLocked && selectedNode.lockType === 'pin' ? '에디터에서 열어 잠금 해제' : '에디터에서 열어 확인/편집'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
