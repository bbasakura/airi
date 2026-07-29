<template>
  <div
    flex="~ col"
    border="solid 1 neutral-200/50 dark:neutral-800/80 hover:border-primary-500/30"
    h-full w-full rounded-2xl shadow-2xl
    bg="neutral-900/60 dark:neutral-950/80" backdrop-blur-md
  >
    <slot />
  </div>
</template>
