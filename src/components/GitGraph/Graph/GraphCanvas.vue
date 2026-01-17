<script setup lang="ts">
/**
 * Git Graph SVG Canvas
 * 绘制 commit 节点和连线
 */

import { computed } from 'vue'
import type { GraphCommit, GraphConnection } from '@/types/gitGraph'

const props = defineProps<{
  commits: (GraphCommit & { virtualIndex: number })[]
  connections: GraphConnection[]
  maxLanes: number
  rowHeight: number
  visibleStart: number
  selectedHash: string | null
}>()

// 画布配置
const laneWidth = 20
const nodeRadius = 5
const graphWidth = computed(() => Math.max(100, (props.maxLanes + 1) * laneWidth))

// 计算画布高度和偏移
const canvasHeight = computed(() => props.commits.length * props.rowHeight)
const offsetY = computed(() => {
  if (props.commits.length === 0) return 0
  return props.commits[0].virtualIndex * props.rowHeight
})

// 获取节点 X 坐标
function getNodeX(lane: number): number {
  return laneWidth + lane * laneWidth
}

// 获取节点 Y 坐标 (相对于可见区域，使用本地索引)
function getNodeY(localIndex: number): number {
  return localIndex * props.rowHeight + props.rowHeight / 2
}

// 计算连线路径 (使用相对于可见区域的坐标)
function getConnectionPath(conn: GraphConnection): string {
  // 计算相对于可见区域的行索引
  const startRow = props.commits.length > 0 ? props.commits[0].virtualIndex : props.visibleStart
  const fromLocalRow = conn.from.row - startRow
  const toLocalRow = conn.to.row - startRow

  const fromX = getNodeX(conn.from.lane)
  const fromY = fromLocalRow * props.rowHeight + props.rowHeight / 2
  const toX = getNodeX(conn.to.lane)
  const toY = toLocalRow * props.rowHeight + props.rowHeight / 2

  if (conn.from.lane === conn.to.lane) {
    // 直线
    return `M ${fromX} ${fromY} L ${toX} ${toY}`
  } else {
    // 曲线 (merge/branch)
    const midY = fromY + props.rowHeight
    return `M ${fromX} ${fromY} L ${fromX} ${midY} Q ${fromX} ${midY + 10} ${toX} ${midY + 20} L ${toX} ${toY}`
  }
}

// 可见的连线 (过滤掉完全不可见的)
const visibleConnections = computed(() => {
  if (props.commits.length === 0) return []
  const startRow = props.commits[0].virtualIndex
  const endRow = props.commits[props.commits.length - 1].virtualIndex
  // 扩展一些范围以确保连线完整显示
  const rangeStart = startRow - 5
  const rangeEnd = endRow + 5
  return props.connections.filter(c =>
    (c.from.row >= rangeStart && c.from.row <= rangeEnd) ||
    (c.to.row >= rangeStart && c.to.row <= rangeEnd)
  )
})
</script>

<template>
  <svg
    class="graph-canvas"
    :width="graphWidth"
    :viewBox="`0 0 ${graphWidth} ${canvasHeight}`"
    :style="{ height: canvasHeight + 'px', transform: `translateY(${offsetY}px)` }"
  >
    <!-- 连线层 -->
    <g class="connections">
      <path
        v-for="(conn, i) in visibleConnections"
        :key="i"
        :d="getConnectionPath(conn)"
        :stroke="conn.color"
        stroke-width="2"
        fill="none"
        :opacity="0.6"
      />
    </g>

    <!-- 节点层 -->
    <g class="nodes">
      <g
        v-for="(commit, index) in commits"
        :key="commit.hash"
        :transform="`translate(${getNodeX(commit.lane)}, ${getNodeY(index)})`"
      >
        <!-- 选中状态光晕 -->
        <circle
          v-if="commit.hash === selectedHash"
          r="10"
          :fill="commit.color"
          opacity="0.2"
        />

        <!-- 节点 -->
        <circle
          :r="commit.isMerge ? nodeRadius + 1 : nodeRadius"
          :fill="commit.isHead ? commit.color : 'var(--mdui-color-surface)'"
          :stroke="commit.color"
          stroke-width="2"
          class="commit-node"
        />

        <!-- 合并节点双圈 -->
        <circle
          v-if="commit.isMerge"
          :r="nodeRadius - 2"
          :fill="commit.color"
        />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.graph-canvas {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}

.commit-node {
  cursor: pointer;
  pointer-events: all;
  transition: all 0.15s;
}

.commit-node:hover {
  transform: scale(1.2);
}
</style>
