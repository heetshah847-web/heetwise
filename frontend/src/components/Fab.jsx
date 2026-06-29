import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { api } from '../api/client.js';
import AddExpenseWizard from './AddExpenseWizard.jsx';

// Always-visible quick-add button. Opens a compact dialog where the user first
// picks a group, then runs the same wizard — so expenses can be added from any
// page without navigating away.
export default function Fab() {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    if (!open) return;
    api
      .listGroups()
      .then((d) => setGroups(d.groups))
      .catch(() => setGroups([]));
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <motion.button
          aria-label="Quick add expense"
          whileHover={{ rotate: 45 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center
                     rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30
                     hover:bg-brand-600"
        >
          <Plus size={26} />
        </motion.button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2
                     -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 text-fg shadow-2xl"
        >
          <Dialog.Title className="mb-4 text-lg font-semibold">
            Add an expense
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Pick a group and add a shared expense.
          </Dialog.Description>
          <AddExpenseWizard groups={groups} onClose={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
