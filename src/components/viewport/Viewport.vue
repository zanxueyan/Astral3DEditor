<template>
  <div class="w-full h-full">
    <Toolbar />

    <div id="viewport" ref="viewportRef" class="absolute top-0 left-0 w-full h-full" @pointerdown="handleViewportPointerdown">
      <ViewportInfo />
    </div>

    <!--  RVT BIM 构件信息悬浮框  -->
    <BIMProperties />

    <!-- IFC BIM 构件信息悬浮框   -->
    <IFCProperties />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, nextTick } from 'vue';
import Toolbar from "@/components/viewport/Toolbar.vue";
import ViewportInfo from "@/components/viewport/ViewportInfo.vue";
import BIMProperties from "@/components/viewport/BIMProperties.vue";
import IFCProperties from "@/components/viewport/IFCProperties.vue";
import { Viewport } from '@/core/Viewport';
import { useDispatchSignal } from "@/hooks/useSignal";

const viewportRef = ref();

//监听视窗变化（节流）
let timer: NodeJS.Timeout | null = null;

function onViewPortResize(width: number, height: number) {
  if (timer) return;
  timer = setTimeout(function () {
    useDispatchSignal("sceneResize", width, height);
    timer = null;
  }, 10)
}

function handleViewportPointerdown(){
  const focusedElement = document.activeElement;
  // @ts-ignore
  if(focusedElement && focusedElement.blur) {
    // @ts-ignore
    focusedElement.blur();
  }
}

onMounted(async () => {
  window.viewer = new Viewport(viewportRef.value);

  await nextTick();

  const resizeObserver = new ResizeObserver(() => {
    onViewPortResize(viewportRef.value.offsetWidth, viewportRef.value.offsetHeight);
  });
  resizeObserver.observe(viewportRef.value);
})
</script>

<style scoped lang="less">

</style>