import { motion } from 'framer-motion';

// Wraps a route's content so AnimatePresence can slide/fade it in from the
// right and the outgoing page out to the left on every route change.
export default function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}
