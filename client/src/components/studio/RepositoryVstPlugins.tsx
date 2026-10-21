import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

interface Inventory { plugins: Array<{ id: string; name: string; version: string; available: boolean; reason: string }>; errors: string[]; }
export function RepositoryVstPlugins() {
  const query = useQuery<Inventory>({ queryKey: ['/api/studio/vst/repository'],
    queryFn: async () => {
      const response = await fetch('/api/studio/vst/repository', { credentials: 'include' });
      if (!response.ok) throw new Error('Could not read repository plugins');
      return response.json();
    }, staleTime: 30000 });
  return <section aria-label="Repository VST3 plugins" className="mx-6 my-3 rounded border border-white/10 p-3 text-sm text-white/70">
    <h3 className="font-medium text-white">Repository VST3 plugins</h3>
    {query.isLoading && <p role="status">Reading installed plugin bundles…</p>}
    {query.isError && <div role="alert">Plugin inventory could not be loaded. <Button size="sm" onClick={() => query.refetch()}>Retry</Button></div>}
    {query.data?.plugins.map(plugin => <div key={plugin.id} className="mt-2">
      <strong>{plugin.name} {plugin.version}</strong><p>{plugin.reason}</p>
    </div>)}
    {query.data && !query.data.plugins.length && !query.data.errors.length && <p>No native bundles are installed.</p>}
    {query.data?.errors.map(error => <p role="alert" key={error}>{error}</p>)}
  </section>;
}
