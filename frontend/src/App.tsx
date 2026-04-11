import { AppHeader } from "@/components/layout/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExperimentTab } from "@/features/experiment/ExperimentTab";
import { ImagingTab } from "@/features/imaging/ImagingTab";
import { PrioritizationTab } from "@/features/prioritization/PrioritizationTab";

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader version="v0.3.0" />

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        <Tabs defaultValue="imaging" className="w-full">
          <TabsList>
            <TabsTrigger value="imaging">Image Analysis</TabsTrigger>
            <TabsTrigger value="prioritization">
              Perturbation Prioritization
            </TabsTrigger>
            <TabsTrigger value="experiment">Experiment Designer</TabsTrigger>
          </TabsList>

          <TabsContent value="imaging">
            <ImagingTab />
          </TabsContent>
          <TabsContent value="prioritization">
            <PrioritizationTab />
          </TabsContent>
          <TabsContent value="experiment">
            <ExperimentTab />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mx-auto max-w-[1400px] px-6 pb-6 pt-4 text-center text-xs text-muted-foreground">
        GlycoQuant · MIT License · Built by Valentin Uzan
      </footer>
    </div>
  );
}
