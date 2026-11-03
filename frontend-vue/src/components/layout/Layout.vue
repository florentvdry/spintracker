<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <TopNav />
    <Header />

    <main class="flex-1 overflow-y-auto bg-dark-500 px-5 py-4">
      <div class="mx-auto animate-fade-in">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<script setup>
import TopNav from './TopNav.vue'
import Header from './Header.vue'
</script>
